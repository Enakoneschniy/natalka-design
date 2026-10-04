/** A polling loop that can never run two timers: one interval between ticks, a doubling wait
 * after a failed tick (capped), and a stop that holds even while a tick is in flight. Pure: the
 * timer functions are injected, so tests drive it by hand. */

export interface PollerOptions<T> {
  intervalMs: number;
  /** One look at the world. A rejection counts as a failed tick and backs off. */
  tick: () => Promise<T>;
  /** True once the result is final; the poller then stops by itself. */
  shouldStop: (result: T) => boolean;
  maxBackoffMs?: number;
  schedule?: (fn: () => void, ms: number) => unknown;
  cancel?: (handle: unknown) => void;
}

export interface Poller {
  start(): void;
  stop(): void;
}

export function createPoller<T>({
  intervalMs,
  tick,
  shouldStop,
  maxBackoffMs = 30_000,
  schedule = (fn, ms) => setTimeout(fn, ms),
  cancel = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}: PollerOptions<T>): Poller {
  let timer: unknown = null;
  let wait = intervalMs;
  // Each start opens a new run; a tick that returns into an older run schedules nothing.
  let run = 0;
  let running = false;

  const plan = (ms: number, mine: number) => {
    if (!running || mine !== run) return;
    timer = schedule(() => void beat(mine), ms);
  };

  async function beat(mine: number) {
    timer = null;
    let result: T;
    try {
      result = await tick();
    } catch {
      if (!running || mine !== run) return;
      wait = Math.min(wait * 2, maxBackoffMs);
      plan(wait, mine);
      return;
    }
    if (!running || mine !== run) return;
    wait = intervalMs;
    if (shouldStop(result)) {
      running = false;
      return;
    }
    plan(wait, mine);
  }

  return {
    start() {
      if (running) return;
      running = true;
      run += 1;
      wait = intervalMs;
      plan(wait, run);
    },
    stop() {
      running = false;
      if (timer !== null) cancel(timer);
      timer = null;
    },
  };
}
