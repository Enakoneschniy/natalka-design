import { describe, expect, it } from 'vitest';
import { createPoller } from './poll';

/** A hand-driven clock: timers wait in a list until the test fires them. */
function fakeTimers() {
  let next = 1;
  const timers = new Map<number, { fn: () => void; ms: number }>();
  return {
    timers,
    schedule: (fn: () => void, ms: number) => {
      const id = next++;
      timers.set(id, { fn, ms });
      return id;
    },
    cancel: (id: unknown) => {
      timers.delete(id as number);
    },
    /** Fires the one pending timer and lets the tick's promise settle. */
    async fire() {
      const [entry] = [...timers.entries()];
      if (!entry) throw new Error('no timer pending');
      timers.delete(entry[0]);
      entry[1].fn();
      for (let i = 0; i < 5; i++) await Promise.resolve();
    },
    delays: () => [...timers.values()].map((t) => t.ms),
  };
}

describe('createPoller', () => {
  it('waits one interval, then ticks, and never runs two timers when started twice', async () => {
    const clock = fakeTimers();
    let ticks = 0;
    const poller = createPoller({
      intervalMs: 5000,
      tick: async () => ++ticks,
      shouldStop: () => false,
      schedule: clock.schedule,
      cancel: clock.cancel,
    });
    poller.start();
    poller.start();
    expect(clock.delays()).toEqual([5000]);
    await clock.fire();
    expect(ticks).toBe(1);
    expect(clock.delays()).toEqual([5000]);
  });

  it('cancels the pending timer on stop, and stop twice is harmless', async () => {
    const clock = fakeTimers();
    let ticks = 0;
    const poller = createPoller({
      intervalMs: 5000,
      tick: async () => ++ticks,
      shouldStop: () => false,
      schedule: clock.schedule,
      cancel: clock.cancel,
    });
    poller.start();
    poller.stop();
    poller.stop();
    expect(clock.timers.size).toBe(0);
    expect(ticks).toBe(0);
  });

  it('does not schedule again when stopped while a tick is in flight', async () => {
    const clock = fakeTimers();
    let release: (value: number) => void = () => {};
    const poller = createPoller({
      intervalMs: 5000,
      tick: () =>
        new Promise<number>((resolve) => {
          release = resolve;
        }),
      shouldStop: () => false,
      schedule: clock.schedule,
      cancel: clock.cancel,
    });
    poller.start();
    await clock.fire();
    poller.stop();
    release(1);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(clock.timers.size).toBe(0);
  });

  it('keeps one timer when restarted while a tick is in flight', async () => {
    const clock = fakeTimers();
    let release: (value: number) => void = () => {};
    const poller = createPoller({
      intervalMs: 5000,
      tick: () =>
        new Promise<number>((resolve) => {
          release = resolve;
        }),
      shouldStop: () => false,
      schedule: clock.schedule,
      cancel: clock.cancel,
    });
    poller.start();
    await clock.fire();
    poller.stop();
    poller.start();
    release(1);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(clock.timers.size).toBe(1);
  });

  it('stops for good once the result is terminal', async () => {
    const clock = fakeTimers();
    const states = ['writing', 'writing', 'ready'];
    const poller = createPoller({
      intervalMs: 5000,
      tick: async () => states.shift() as string,
      shouldStop: (state) => state === 'ready',
      schedule: clock.schedule,
      cancel: clock.cancel,
    });
    poller.start();
    await clock.fire();
    await clock.fire();
    expect(clock.timers.size).toBe(1);
    await clock.fire();
    expect(clock.timers.size).toBe(0);
  });

  it('backs off on a failed tick, doubling up to 30 seconds, and resets on success', async () => {
    const clock = fakeTimers();
    let fail = true;
    const poller = createPoller({
      intervalMs: 5000,
      tick: async () => {
        if (fail) throw new Error('offline');
        return 'writing';
      },
      shouldStop: () => false,
      schedule: clock.schedule,
      cancel: clock.cancel,
    });
    poller.start();
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      await clock.fire();
      seen.push(...clock.delays());
    }
    expect(seen).toEqual([10_000, 20_000, 30_000, 30_000]);
    fail = false;
    await clock.fire();
    expect(clock.delays()).toEqual([5000]);
  });
});
