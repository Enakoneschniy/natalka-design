'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

/** The offer, kept within reach on a phone.
 *
 * It appears only once the card's own button has scrolled out of sight: two identical buttons on
 * the same screen read as a mistake, and the one that is pinned to the bottom of the window is
 * the one in the way.
 */
export function StickyBuy({ href, label }: { href: string; label: string }) {
  const [show, setShow] = useState(false);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const watched = document.querySelector('.paywall-card .btn');
    if (!watched) return;
    const observer = new IntersectionObserver(
      ([entry]) => setShow(!entry?.isIntersecting),
      // A button half-hidden behind the bar counts as out of sight.
      { rootMargin: '-80px 0px -80px 0px' },
    );
    observer.observe(watched);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={`paywall-sticky${show ? ' is-shown' : ''}`} ref={bar} aria-hidden={!show}>
      <Link className="btn btn-primary btn-lg btn-block" href={href} tabIndex={show ? 0 : -1}>
        {label}
      </Link>
    </div>
  );
}
