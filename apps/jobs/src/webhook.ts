/** What Stripe tells us about a payment: it settled, it failed, it was refunded or disputed.
 *
 * Events are signed (see verifyWebhook), may arrive twice and in any order. Every write below is
 * conditional on the state it leaves, so a repeated event changes nothing, and a refund or a
 * dispute that overtakes the completion of its payment leaves a tombstone the completion finds.
 * The owner is told by email about anything a person has to act on; the alerts carry ids only. */

import {
  bumpStat,
  orderFacts,
  recordTombstone,
  dropTombstone,
  refundOrder,
  setDisputeHold,
  settleOrderPayment,
} from './db';
import type { Env } from './env';
import { json } from './http';
import { sendAlert } from './mail';
import { disputePurchase, disputeWon, markFailed, markPaid, markRefunded } from './pro/purchases';
import { type StripeEvent, verifyWebhook } from './stripe';

type StripeObject = StripeEvent['data']['object'];

export async function stripeWebhook(request: Request, env: Env): Promise<Response> {
  const event = await verifyWebhook(env, request);
  if (!event) return new Response('bad signature', { status: 400 });
  const object = event.data.object;
  // A seller's credit pack never reaches the shopper's order code.
  const pack = object.metadata?.kind === 'pro_pack';

  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      return pack ? packPaid(env, object) : orderPaid(env, object);
    case 'checkout.session.async_payment_failed':
    case 'checkout.session.expired':
      if (pack) {
        // markFailed leaves a purchase that is already paid alone.
        await markFailed(env.DB, object.metadata?.purchase_id ?? '', object.metadata?.account_id ?? '');
        return json(event.type === 'checkout.session.expired' ? { received: true, pack: 'expired' } : { received: true });
      }
      // A shopper's order stays pending: they can open a new payment page from the order's page.
      return json({ received: true });
    case 'charge.refunded':
      return chargeRefunded(env, object);
    case 'charge.dispute.created':
      return disputeCreated(env, object);
    case 'charge.dispute.closed':
      return disputeClosed(env, object);
    default:
      return json({ received: true, ignored: event.type });
  }
}

/** A shopper's payment settled. The job is queued here and nowhere else once payments are live; a
 * session that never completes leaves a pending order, which the sweep clears after a week. */
async function orderPaid(env: Env, session: StripeObject): Promise<Response> {
  if (session.payment_status && session.payment_status !== 'paid') return json({ received: true });
  const orderId = session.metadata?.order_id ?? session.client_reference_id;
  const jobId = session.metadata?.job_id;
  if (!orderId || !jobId) return json({ received: true, ignored: 'no order' });

  const paymentIntent = session.payment_intent ?? null;
  const result = await settleOrderPayment(env.DB, {
    orderId,
    paymentIntent,
    amountSubtotal: session.amount_subtotal,
    currency: session.currency,
  });
  if (result === 'paid') {
    await env.JOBS.send({ jobId });
    const facts = await orderFacts(env.DB, orderId);
    if (facts) {
      await bumpStat(env.DB, {
        event: 'paid',
        variant: facts.variant,
        source: facts.source,
        country: facts.country,
        currency: facts.currency,
        amountMinor: facts.amount_minor,
      });
    }
    return json({ received: true, queued: true });
  }

  const ids = `order ${orderId}\ncheckout session ${session.id}\npayment ${paymentIntent ?? '-'}`;
  if (result === 'mismatch') {
    await sendAlert(
      env,
      'Payment of the wrong amount: refund it',
      `${ids}\npaid ${session.amount_subtotal ?? '-'} ${session.currency ?? '-'}\nNothing was written; the order is held.`,
    );
  } else if (result === 'second_payment') {
    await sendAlert(env, 'A second payment for one order: refund it', `${ids}\nThe order was already settled by another payment.`);
  } else if (result === 'unknown') {
    await sendAlert(env, 'A payment for an order that does not exist: refund it', ids);
  }
  return json({ received: true, queued: false, order: result });
}

async function packPaid(env: Env, session: StripeObject): Promise<Response> {
  if (session.payment_status !== 'paid') return json({ received: true });
  const meta = session.metadata ?? {};
  if (!session.payment_intent) {
    console.error('pro pack paid without a payment_intent; a later refund will not be matched to it', meta.purchase_id);
  }
  const pack = await markPaid(env.DB, {
    purchaseId: meta.purchase_id ?? '',
    accountId: meta.account_id ?? '',
    paymentIntent: session.payment_intent ?? null,
    amountSubtotal: session.amount_subtotal ?? -1,
    currency: session.currency ?? '',
  });
  if (pack === 'mismatch') {
    // The seller paid an amount we did not ask for and got no credits: the owner must refund.
    await sendAlert(
      env,
      'Credit pack paid with the wrong amount: refund it',
      `purchase ${meta.purchase_id}\naccount ${meta.account_id}\npaid ${session.amount_subtotal ?? '-'} ${session.currency ?? '-'}`,
    );
  }
  return json({ received: true, pack });
}

/** Only a full refund closes anything; a partial one is the owner's goodwill and changes nothing. */
async function chargeRefunded(env: Env, charge: StripeObject): Promise<Response> {
  if (charge.refunded !== true) {
    console.warn('partial refund ignored', charge.id, charge.amount_refunded);
    return json({ received: true, ignored: 'partial refund' });
  }
  const paymentIntent = charge.payment_intent;
  if (!paymentIntent) return json({ received: true, ignored: 'no payment' });
  // First, so that a completion of this payment still on its way finds it.
  await recordTombstone(env.DB, { paymentIntent, kind: 'refund', ref: charge.id });
  const order = await refundOrder(env.DB, paymentIntent);
  if (order !== 'unknown') return json({ received: true, refund: order });
  return json({ received: true, refund: await markRefunded(env.DB, paymentIntent) });
}

/** A dispute holds a shopper's document and takes a seller's credits back until it is won. */
async function disputeCreated(env: Env, dispute: StripeObject): Promise<Response> {
  const paymentIntent = dispute.payment_intent;
  if (!paymentIntent) return json({ received: true, ignored: 'no payment' });
  await recordTombstone(env.DB, { paymentIntent, kind: 'dispute', ref: dispute.id });
  const ids = `dispute ${dispute.id}\npayment ${paymentIntent}`;

  const orderId = await setDisputeHold(env.DB, paymentIntent, true);
  if (orderId) {
    await sendAlert(env, 'Payment disputed', `${ids}\norder ${orderId}\nThe document is withheld until the dispute is won.`);
    return json({ received: true, dispute: 'order' });
  }
  const pack = await disputePurchase(env.DB, { paymentIntent, disputeId: dispute.id });
  await sendAlert(
    env,
    'Payment disputed',
    pack === 'unknown' ? `${ids}\nNo order or credit pack has this payment yet.` : `${ids}\ncredit pack: ${pack}`,
  );
  return json({ received: true, dispute: pack });
}

async function disputeClosed(env: Env, dispute: StripeObject): Promise<Response> {
  const paymentIntent = dispute.payment_intent;
  if (!paymentIntent) return json({ received: true, ignored: 'no payment' });
  // Lost: the money is gone and the document and credits stay withheld; nothing changes.
  if (dispute.status !== 'won') return json({ received: true, dispute: dispute.status ?? 'closed' });
  await dropTombstone(env.DB, paymentIntent, 'dispute');
  const orderId = await setDisputeHold(env.DB, paymentIntent, false);
  if (orderId) return json({ received: true, dispute: 'won' });
  return json({ received: true, dispute: await disputeWon(env.DB, { paymentIntent, disputeId: dispute.id }) });
}
