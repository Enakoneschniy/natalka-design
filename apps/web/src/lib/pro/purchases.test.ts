import { describe, expect, it } from 'vitest';
import {
  buyError,
  checkoutTarget,
  inviteOutcome,
  money,
  PACKS,
  PURCHASE_WAIT_MS,
  type Purchase,
  perReading,
  purchaseId,
  purchaseLine,
  purchasePill,
  purchaseWatch,
  refundLine,
  signupInviteNotice,
} from './purchases';
import { TEXT } from './text';

const TRY_LATER = TEXT.ru.common.tryLater;

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
    expect(PACKS.map((p) => perReading(p, 'ru'))).toEqual([
      '€9,90 за отчёт',
      '€8,30 за отчёт',
      '€6,90 за отчёт',
    ]);
    expect(perReading(PACKS[0] as (typeof PACKS)[number], 'uk')).toBe('€9,90 за звіт');
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
    expect(purchasePill('paid', 'ru')).toEqual({ label: 'оплачено', tone: 'ok' });
    expect(purchasePill('pending', 'ru')).toEqual({ label: 'ожидает оплаты', tone: 'wr' });
    expect(purchasePill('failed', 'ru')).toEqual({ label: 'не прошла', tone: 'bad' });
    expect(purchasePill('refunded', 'ru')).toEqual({ label: 'возвращено', tone: 'gold' });
    expect(purchasePill('paid', 'uk')).toEqual({ label: 'оплачено', tone: 'ok' });
    expect(purchasePill('pending', 'uk')).toEqual({ label: 'очікує оплати', tone: 'wr' });
  });

  it('titles a purchase by its credits and price', () => {
    expect(purchaseLine(paid, 'ru')).toBe('30 кредитов · €249');
  });

  it('says until when a refundable pack can be returned: 14 days after payment', () => {
    expect(refundLine(paid, 'ru')).toBe('можно вернуть до 15 окт');
  });

  it('says nothing about a refund when the pack is not refundable', () => {
    expect(refundLine({ ...paid, refundable: false }, 'ru')).toBeNull();
    expect(refundLine({ ...paid, paid_at: null }, 'ru')).toBeNull();
  });
});

describe('buying', () => {
  it('tells a payment outage from any other failure', () => {
    expect(buyError(503, 'ru')).toBe('Оплата временно недоступна');
    expect(buyError(503, 'uk')).toBe('Оплата тимчасово недоступна');
    expect(buyError(502, 'ru')).toBe(TRY_LATER);
    expect(buyError(0, 'ru')).toBe(TRY_LATER);
  });

  it('goes only to Stripe Checkout over https or a page of the cabinet itself', () => {
    const base = 'https://pro.chronika.me';
    const to = (url: unknown) => checkoutTarget(url, base);
    expect(to('https://checkout.stripe.com/c/pay/x')).toBe('https://checkout.stripe.com/c/pay/x');
    expect(to('/credits?purchase=pu-1')).toBe('https://pro.chronika.me/credits?purchase=pu-1');
    expect(to('https://pro.chronika.me/credits')).toBe('https://pro.chronika.me/credits');
    expect(to('https://evil.example')).toBeNull();
    expect(to('https://evil.example/c/pay/x')).toBeNull();
    expect(to('/\t/evil.example')).toBeNull();
    expect(to('/\n/evil.example/x')).toBeNull();
    expect(to('//evil.example/x')).toBeNull();
    expect(to('/\\evil.example/x')).toBeNull();
    expect(to('javascript:alert(1)')).toBeNull();
    expect(to('http://checkout.stripe.com/c/pay/x')).toBeNull();
    expect(to('https://checkout.stripe.com.evil.example/x')).toBeNull();
    expect(to('https://checkout.stripe.com:8443/x')).toBeNull();
    expect(to('http://pro.chronika.me/credits')).toBeNull();
    expect(to(undefined)).toBeNull();
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
    expect(inviteOutcome(200, { credits: 3 }, 'ru')).toEqual({ ok: true, text: '+3 кредита' });
    expect(inviteOutcome(200, null, 'ru')).toEqual({ ok: true, text: 'Код принят' });
    expect(inviteOutcome(404, null, 'ru')).toEqual({ ok: false, text: 'Код не найден' });
    expect(inviteOutcome(409, null, 'ru')).toEqual({
      ok: false,
      text: 'Вы уже активировали инвайт-код',
    });
    expect(inviteOutcome(502, null, 'ru')).toEqual({ ok: false, text: TRY_LATER });
  });
});

describe('signupInviteNotice', () => {
  it('says the sign-up code did not apply, until a code is taken', () => {
    expect(signupInviteNotice('refused', false, 'ru')).toEqual({
      title: 'Инвайт-код не подошёл',
      text: 'Он уже использован или введён с ошибкой, кредиты по нему не начислены. Если у вас есть другой код, введите его ниже.',
    });
    expect(signupInviteNotice('failed', false, 'ru')).toEqual({
      title: 'Инвайт-код не удалось применить',
      text: 'Кредиты по нему не начислены. Введите код ещё раз ниже.',
    });
    expect(signupInviteNotice('refused', true, 'ru')).toBeNull();
    expect(signupInviteNotice(undefined, false, 'ru')).toBeNull();
    expect(signupInviteNotice(['refused', 'refused'], false, 'ru')).toBeNull();
    expect(signupInviteNotice('granted', false, 'ru')).toBeNull();
  });
});
