/** What Stripe tells us about a payment: it settled, it failed, it was refunded or disputed.
 *
 * Events are signed (see verifyWebhook), may arrive twice and in any order. Every write below is
 * conditional on the state it leaves, so a repeated event changes nothing, and a refund or a
 * dispute that overtakes the completion of its payment leaves a tombstone the completion finds.
 * The owner is told by email about anything a person has to act on; the alerts carry ids only. */

import {
  bumpStat,
  dropDispute,
  orderFacts,
  recordDispute,
  recordRefund,
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

  if (result === 'already' && (await neverStarted(env, orderId, jobId))) {
    // Stripe sends the event again when our answer failed, and the queue may be why: the order is
    // paid but its job never ran. Queued again, the job's lease keeps a duplicate harmless.
    await env.JOBS.send({ jobId });
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

/** A paid order (not held) whose job has not had a single run. */
async function neverStarted(env: Env, orderId: string, jobId: string): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT 1 AS yes FROM jobs j JOIN orders o ON o.id = j.order_id
     WHERE j.id = ? AND o.id = ? AND o.status = 'paid' AND o.hold IS NULL
       AND j.status = 'queued' AND j.attempts = 0`,
  )
    .bind(jobId, orderId)
    .first();
  return Boolean(row);
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
  await recordRefund(env.DB, paymentIntent, charge.id);
  const order = await refundOrder(env.DB, paymentIntent);
  if (order !== 'unknown') return json({ received: true, refund: order });
  return json({ received: true, refund: await markRefunded(env.DB, paymentIntent) });
}

/** A dispute holds a shopper's document and takes a seller's credits back until it is won. A
 * second dispute of the same payment keeps the document withheld until each is won, and leaves a
 * pack's credits taken for the owner to settle. */
async function disputeCreated(env: Env, dispute: StripeObject): Promise<Response> {
  const paymentIntent = dispute.payment_intent;
  if (!paymentIntent) return json({ received: true, ignored: 'no payment' });
  const others = (await recordDispute(env.DB, paymentIntent, dispute.id)).filter((id) => id !== dispute.id);
  const second = others.length > 0;
  let ids = `dispute ${dispute.id}\npayment ${paymentIntent}`;
  if (second) ids += `\nnot won yet: ${others.join(' ')}`;
  const subject = second ? 'A second dispute on one payment' : 'Payment disputed';

  const order = await setDisputeHold(env.DB, paymentIntent, true);
  if (order) {
    const until = second ? 'every dispute of the payment is won' : 'the dispute is won';
    await sendAlert(env, subject, `${ids}\norder ${order.id}\nThe document is withheld until ${until}.`);
    return json({ received: true, dispute: 'order' });
  }
  const pack = await disputePurchase(env.DB, { paymentIntent, disputeId: dispute.id });
  if (pack === 'multiple') {
    await sendAlert(
      env,
      'A second dispute on one payment: settle the credits by hand',
      `${ids}\nThe credit pack's credits stay taken whichever dispute is won.`,
    );
  } else {
    await sendAlert(
      env,
      subject,
      pack === 'unknown' ? `${ids}\nNo order or credit pack has this payment yet.` : `${ids}\ncredit pack: ${pack}`,
    );
  }
  return json({ received: true, dispute: pack });
}

/** Won, or an inquiry closed without becoming a dispute ('warning_closed'): what the dispute held
 * or took comes back, unless another dispute of the payment still holds it. Lost: the money is gone
 * and the document and credits stay withheld. */
async function disputeClosed(env: Env, dispute: StripeObject): Promise<Response> {
  const paymentIntent = dispute.payment_intent;
  if (!paymentIntent) return json({ received: true, ignored: 'no payment' });
  if (dispute.status !== 'won' && dispute.status !== 'warning_closed') {
    return json({ received: true, dispute: dispute.status ?? 'closed' });
  }
  await dropDispute(env.DB, paymentIntent, dispute.id);
  const order = await setDisputeHold(env.DB, paymentIntent, false);
  if (order) {
    // Another dispute of the payment, open or lost, keeps the document withheld.
    if (order.hold === 'disputed') return json({ received: true, dispute: 'held' });
    // A payment disputed before it settled was never written; it is now.
    const job = await env.DB.prepare('SELECT id FROM jobs WHERE order_id = ?').bind(order.id).first<{ id: string }>();
    if (job && (await neverStarted(env, order.id, job.id))) {
      await env.JOBS.send({ jobId: job.id });
      return json({ received: true, dispute: 'won', queued: true });
    }
    return json({ received: true, dispute: 'won' });
  }
  const pack = await disputeWon(env.DB, { paymentIntent, disputeId: dispute.id });
  if (pack === 'manual') {
    await sendAlert(
      env,
      'A dispute closed on a payment disputed twice: settle the credits by hand',
      `dispute ${dispute.id}\npayment ${paymentIntent}\nstatus ${dispute.status}\nThe credit pack's credits stay taken.`,
    );
  }
  return json({ received: true, dispute: pack });
}
