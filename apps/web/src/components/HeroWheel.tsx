import { Wheel } from '@/components/Wheel';
import type { ChartFacts } from '@/lib/chart';

/** The first hero: the demo natal chart with two orbit rings and a travelling dot. Kept whole so
 * that switching back from the orrery is one word in the landing page. */
export function HeroWheel({ facts }: { facts: ChartFacts }) {
  return (
    <div className="wheel-glow">
      <Wheel facts={facts} size={640} animate />
      {/* Each ring spins, and a spinning square box is wider than the page; the wrapper keeps
          that growth out of the layout. The ring is inscribed in it, so nothing visible is
          clipped. */}
      <span className="orbit-box orbit-box-1" aria-hidden="true">
        <span className="orbit orbit-1" />
      </span>
      <span className="orbit-box orbit-box-2" aria-hidden="true">
        <span className="orbit orbit-2" />
      </span>
    </div>
  );
}
