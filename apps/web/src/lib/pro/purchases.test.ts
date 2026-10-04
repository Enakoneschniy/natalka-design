import { describe, expect, it } from 'vitest';
import { TRY_LATER } from './messages';
import {
  buyError,
  checkoutTarget,
  inviteOutcome,
  money,
  PACKS,
  PAYMENT_UNAVAILABLE,
  PURCHASE_WAIT_MS,
  type Purchase,
  purchaseId,
  purchaseLine,
  purchasePill,
  purchaseWatch,
  refundLine,
} from './purchases';

describe('money', () => {
  it('shows whole euros without cents and cents with a comma', () => {
    expect(money(9900, 'EUR')).toBe('€99');
    expect(money(69000, 'EUR')).toBe('€690');
    expect(money(990, 'EUR')).toBe('€9,90');
    expect(money(830, 'eur')).toBe('€8,30');
    expect(money(5, 'EUR')).toBe('€0,05');
  });

  it('falls back to the currency code for anything but euros', () => {
    expect(money(1000, 'USD')).toBe('10 USD');
  });
});

describe('PACKS', () => {
  it('are the three jobs packs, each with its price per reading', () => {
    expect(PACKS.map((p) => [p.id, p.credits, money(p.amount_minor, 'EUR')])).toEqual([
      ['p10', 10, '€99'],
      ['p30', 30, '€249'],
      ['p100', 100, '€690'],
    ]);
    expect(PACKS.map((p) => p.per)).toEqual(['€9,90 за отчёт', '€8,30 за отчёт', '€6,90 за отчёт']);
    expect(PACKS.filter((p) => p.best).map((p) => p.id)).toEqual(['p30']);
  });
});

const paid: Purchase = {
  id: 'pu-1',
  pack: 'p30',
  credits: 30,
  amount_minor: 24900,
  currency: 'EUR',
  status: 'paid',
  created_at: '2026-10-01T09:00:00.000Z',
  paid_at: '2026-10-01T09:02:00.000Z',
  refundable: true,
};

describe('purchase history', () => {
  it('names each status with a pill', () => {
    expect(purchasePill('paid')).toEqual({ label: 'оплачено', tone: 'ok' });
    expect(purchasePill('pending')).toEqual({ label: 'ожидает оплаты', tone: 'wr' });
    expect(purchasePill('failed')).toEqual({ label: 'не прошла', tone: 'bad' });
    expect(purchasePill('refunded')).toEqual({ label: 'возвращено', tone: 'gold' });
  });

  it('titles a purchase by its credits and price', () => {
    expect(purchaseLine(paid)).toBe('30 кредитов · €249');
  });

  it('says until when a refundable pack can be returned: 14 days after payment', () => {
    expect(refundLine(paid)).toBe('можно вернуть до 15 окт');
  });

  it('says nothing about a refund when the pack is not refundable', () => {
    expect(refundLine({ ...paid, refundable: false })).toBeNull();
    expect(refundLine({ ...paid, paid_at: null })).toBeNull();
  });
});

describe('buying', () => {
  it('tells a payment outage from any other failure', () => {
    expect(buyError(503)).toBe(PAYMENT_UNAVAILABLE);
    expect(PAYMENT_UNAVAILABLE).toBe('Оплата временно недоступна');
    expect(buyError(502)).toBe(TRY_LATER);
    expect(buyError(0)).toBe(TRY_LATER);
  });

  it('goes only to an https page or one of the cabinet own paths', () => {
    expect(checkoutTarget('https://checkout.stripe.com/c/pay/cs_1')).toBe(
      'https://checkout.stripe.com/c/pay/cs_1',
    );
    expect(checkoutTarget('/credits?purchase=pu-1')).toBe('/credits?purchase=pu-1');
    expect(checkoutTarget('javascript:alert(1)')).toBeNull();
    expect(checkoutTarget('//evil.example/x')).toBeNull();
    expect(checkoutTarget('/\\evil.example/x')).toBeNull();
    expect(checkoutTarget('http://checkout.example')).toBeNull();
    expect(checkoutTarget(undefined)).toBeNull();
  });
});

describe('purchaseId', () => {
  it('keeps a well-formed id from the return address and drops anything else', () => {
    expect(purchaseId('pu-1')).toBe('pu-1');
    expect(purchaseId(['pu-1', 'pu-2'])).toBe('pu-1');
    expect(purchaseId(undefined)).toBeNull();
    expect(purchaseId('../me')).toBeNull();
    expect(purchaseId('')).toBeNull();
  });
});

describe('purchaseWatch', () => {
  it('ends on paid or failed, keeps waiting until the minute is up, then gives up', () => {
    expect(purchaseWatch('paid', 3_000)).toBe('paid');
    expect(purchaseWatch('failed', 3_000)).toBe('failed');
    expect(purchaseWatch('pending', 3_000)).toBe('waiting');
    expect(purchaseWatch(undefined, 3_000)).toBe('waiting');
    expect(purchaseWatch('pending', PURCHASE_WAIT_MS)).toBe('timeout');
    expect(purchaseWatch('paid', PURCHASE_WAIT_MS + 1)).toBe('paid');
  });

  it('treats a refunded purchase as settled: it was paid', () => {
    expect(purchaseWatch('refunded', 3_000)).toBe('paid');
  });
});

describe('inviteOutcome', () => {
  it('reports the credits added, or why the code was refused', () => {
    expect(inviteOutcome(200, { credits: 3 })).toEqual({ ok: true, text: '+3 кредита' });
    expect(inviteOutcome(200, null)).toEqual({ ok: true, text: 'Код принят' });
    expect(inviteOutcome(404, null)).toEqual({ ok: false, text: 'Код не найден' });
    expect(inviteOutcome(409, null)).toEqual({ ok: false, text: 'Код уже использован' });
    expect(inviteOutcome(502, null)).toEqual({ ok: false, text: TRY_LATER });
  });
});
