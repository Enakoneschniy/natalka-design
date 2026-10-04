/** How the Кредиты tab speaks about packs, purchases and invite codes. Pure; the page and its
 * client components share it. */

import { creditsLabel } from './credits';
import { TRY_LATER } from './messages';
import { dayMonth, type Pill } from './readings';

export type PackId = 'p10' | 'p30' | 'p100';
export type PurchaseStatus = 'pending' | 'paid' | 'failed' | 'refunded';

/** A purchase as `GET purchases` returns it (jobs `PurchaseView`). */
export interface Purchase {
  id: string;
  pack: PackId;
  credits: number;
  amount_minor: number;
  currency: string;
  status: PurchaseStatus;
  created_at: string;
  paid_at: string | null;
  refundable: boolean;
}

/** Shows a minor-unit amount: «€99», «€9,90». Only euros are sold; anything else keeps its code. */
export function money(minor: number, currency: string): string {
  const whole = minor % 100 === 0;
  const amount = whole
    ? String(minor / 100)
    : `${Math.floor(minor / 100)},${String(minor % 100).padStart(2, '0')}`;
  return currency.toUpperCase() === 'EUR' ? `€${amount}` : `${amount} ${currency.toUpperCase()}`;
}

export interface Pack {
  id: PackId;
  credits: number;
  amount_minor: number;
  /** «€8,30 за отчёт». */
  per: string;
  /** The pack the tab points out as the better deal. */
  best: boolean;
}

const pack = (id: PackId, credits: number, amount_minor: number, best = false): Pack => ({
  id,
  credits,
  amount_minor,
  per: `${money(Math.round(amount_minor / credits), 'EUR')} за отчёт`,
  best,
});

/** The packs for sale, the same as jobs `PACKS` (the price charged is always the jobs one). */
export const PACKS: Pack[] = [
  pack('p10', 10, 9900),
  pack('p30', 30, 24900, true),
  pack('p100', 100, 69000),
];

const PILL: Record<PurchaseStatus, Pill> = {
  paid: { label: 'оплачено', tone: 'ok' },
  pending: { label: 'ожидает оплаты', tone: 'wr' },
  failed: { label: 'не прошла', tone: 'bad' },
  refunded: { label: 'возвращено', tone: 'gold' },
};

export function purchasePill(status: PurchaseStatus): Pill {
  return PILL[status] ?? PILL.pending;
}

/** «30 кредитов · €249». */
export function purchaseLine(p: Pick<Purchase, 'credits' | 'amount_minor' | 'currency'>): string {
  return `${creditsLabel(p.credits)} · ${money(p.amount_minor, p.currency)}`;
}

/** A paid pack may be returned for this many days (jobs `REFUND_DAYS`). */
export const REFUND_DAYS = 14;

/** «можно вернуть до 15 окт» while jobs says the pack is refundable; null otherwise. A hint for
 * the seller: the refund itself is made by hand in Stripe. */
export function refundLine(p: Pick<Purchase, 'refundable' | 'paid_at'>): string | null {
  if (!p.refundable || !p.paid_at) return null;
  const paid = Date.parse(p.paid_at);
  if (Number.isNaN(paid)) return null;
  return `можно вернуть до ${dayMonth(new Date(paid + REFUND_DAYS * 86_400_000).toISOString())}`;
}

export const PAYMENT_UNAVAILABLE = 'Оплата временно недоступна';

/** What a failed `POST purchases` tells the seller. */
export function buyError(status: number): string {
  return status === 503 ? PAYMENT_UNAVAILABLE : TRY_LATER;
}

const STRIPE_CHECKOUT = 'checkout.stripe.com';

/** Where «Купить» may send the browser: Stripe Checkout over https, or a page of the cabinet
 * itself (`base` is its origin). The address is parsed the way the browser will parse it, so a
 * protocol-relative host, a tab or newline smuggled into the path, or a script URL is refused. */
export function checkoutTarget(url: unknown, base: string): string | null {
  if (typeof url !== 'string') return null;
  let target: URL;
  try {
    target = new URL(url, base);
  } catch {
    return null;
  }
  if (target.origin === new URL(base).origin) return target.href;
  if (target.protocol === 'https:' && target.host === STRIPE_CHECKOUT) return target.href;
  return null;
}

const ID = /^[A-Za-z0-9-]+$/;

/** The purchase id from `/credits?purchase=<id>`, when it looks like one. */
export function purchaseId(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && ID.test(value) ? value : null;
}

/** How often, and for how long, the return page asks whether the payment has landed. */
export const PURCHASE_POLL_MS = 3_000;
export const PURCHASE_WAIT_MS = 60_000;

export type PurchaseWatch = 'waiting' | 'paid' | 'failed' | 'timeout';

/** Where the watch stands after a look: settled one way or the other, still waiting, or out of
 * time. A refunded purchase was paid first. */
export function purchaseWatch(
  status: PurchaseStatus | undefined,
  elapsedMs: number,
): PurchaseWatch {
  if (status === 'paid' || status === 'refunded') return 'paid';
  if (status === 'failed') return 'failed';
  return elapsedMs >= PURCHASE_WAIT_MS ? 'timeout' : 'waiting';
}

/** What `POST invite` tells the seller. */
export function inviteOutcome(
  status: number,
  data: { credits?: number } | null,
): { ok: boolean; text: string } {
  if (status === 200) {
    return typeof data?.credits === 'number'
      ? { ok: true, text: `+${creditsLabel(data.credits)}` }
      : { ok: true, text: 'Код принят' };
  }
  if (status === 404) return { ok: false, text: 'Код не найден' };
  if (status === 409) return { ok: false, text: 'Вы уже активировали инвайт-код' };
  return { ok: false, text: TRY_LATER };
}
