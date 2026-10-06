import { describe, expect, it } from 'vitest';
import { closedOrder, offersPayment, PAYMENT_GRACE_MS, settled } from './order-state';

const view = (
  order_status: string,
  extra: Partial<{ paid: boolean; step: string; status: string }> = {},
) => ({
  paid: order_status === 'paid' || order_status === 'test',
  order_status,
  step: 'calc',
  status: 'queued',
  ...extra,
});

describe('closedOrder', () => {
  it('names the three ways an order closes', () => {
    expect(closedOrder(view('refunded'))).toBe('refunded');
    expect(closedOrder(view('disputed'))).toBe('disputed');
    expect(closedOrder(view('failed'))).toBe('declined');
  });

  it('leaves an open order open', () => {
    for (const status of ['pending', 'paid', 'test', undefined]) {
      expect(
        closedOrder({ paid: false, order_status: status, step: 'calc', status: 'queued' }),
      ).toBeNull();
    }
  });
});

describe('offersPayment', () => {
  const since = 1_000_000;

  it('waits out the grace period before offering to pay again', () => {
    expect(offersPayment(view('pending'), since, since + PAYMENT_GRACE_MS - 1)).toBe(false);
    expect(offersPayment(view('pending'), since, since + PAYMENT_GRACE_MS)).toBe(true);
  });

  it('never offers it for an order that is paid, free, closed or not yet seen pending', () => {
    for (const status of ['paid', 'test', 'refunded', 'disputed', 'failed']) {
      expect(offersPayment(view(status), since, since + 60_000), status).toBe(false);
    }
    expect(offersPayment(view('pending'), null, since)).toBe(false);
    expect(offersPayment(view('pending', { paid: true }), since, since + 60_000)).toBe(false);
  });
});

describe('settled', () => {
  it('stops asking once nothing more will change', () => {
    expect(settled(view('paid', { step: 'done' }))).toBe(true);
    expect(settled(view('paid', { status: 'failed' }))).toBe(true);
    expect(settled(view('refunded'))).toBe(true);
    expect(settled(view('pending'))).toBe(false);
    expect(settled(view('paid', { step: 'texts', status: 'running' }))).toBe(false);
  });
});
