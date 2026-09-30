'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** How far a finger has to travel, and how much straighter than it is tall, to count as a page
 * turn rather than a tap that wandered. */
const SWIPE_PX = 48;

/** Four pages of a finished document. Clicking one opens it over the page rather than in a new
 * tab: a reader who leaves the landing to look at a screenshot has to find their way back. */
export function SampleGallery({ labels }: { labels: string[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const close = useCallback(() => setOpen(null), []);
  const move = useCallback(
    (step: number) =>
      setOpen((i) => (i === null ? null : (i + step + labels.length) % labels.length)),
    [labels.length],
  );

  useEffect(() => {
    if (open === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
      if (event.key === 'ArrowRight') move(1);
      if (event.key === 'ArrowLeft') move(-1);
    };
    document.addEventListener('keydown', onKey);

    // The page behind must not move at all. `overflow: hidden` alone does not hold on a phone —
    // a touch that starts on the dialog still scrolls the document under it, and the browser's
    // own toolbar slides away with it. Taking the body out of flow at its current offset does,
    // and putting the offset back on close means the reader returns to where they were.
    const { body, documentElement: html } = document;
    const offset = window.scrollY;
    const kept = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: html.style.overflow,
    };
    // On a desktop the scrollbar goes with the scrolling; leaving its width behind keeps the
    // page underneath from jumping sideways as the dialog opens.
    const bar = window.innerWidth - html.clientWidth;
    body.style.position = 'fixed';
    body.style.top = `${-offset}px`;
    body.style.width = bar > 0 ? `calc(100% - ${bar}px)` : '100%';
    html.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      body.style.position = kept.position;
      body.style.top = kept.top;
      body.style.width = kept.width;
      html.style.overflow = kept.overflow;
      window.scrollTo(0, offset);
    };
  }, [open, close, move]);

  /** A page turn by finger. Vertical movement is left alone: there is nothing to scroll here,
   * and a swipe that is mostly downwards is someone reaching for the browser, not the next page. */
  const onTouchStart = useCallback((event: React.TouchEvent) => {
    const first = event.touches[0];
    touch.current = first ? { x: first.clientX, y: first.clientY } : null;
  }, []);

  const onTouchEnd = useCallback(
    (event: React.TouchEvent) => {
      const start = touch.current;
      const last = event.changedTouches[0];
      touch.current = null;
      if (!start || !last) return;
      const dx = last.clientX - start.x;
      const dy = last.clientY - start.y;
      if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy)) return;
      move(dx < 0 ? 1 : -1);
    },
    [move],
  );

  return (
    <>
      <ul className="l-gallery">
        {labels.map((label, i) => (
          <li key={label}>
            <button type="button" onClick={() => setOpen(i)}>
              {/* Static files of a known size; the image optimiser has nothing to add. */}
              {/* biome-ignore lint/performance/noImgElement: a static asset, not a photo */}
              <img
                src={`/sample/page-${i + 1}.png`}
                alt={label}
                width={595}
                height={842}
                loading="lazy"
              />
              <span className="caption">{label}</span>
            </button>
          </li>
        ))}
      </ul>

      {open !== null ? (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={labels[open]}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {/* The backdrop is a button so that closing by clicking away is reachable from the
              keyboard too; Escape does the same while the dialog is open. */}
          <button type="button" className="lightbox-backdrop" onClick={close} aria-label="Close" />
          <button type="button" className="lightbox-close" onClick={close} aria-label="Close">
            ×
          </button>
          <button
            type="button"
            className="lightbox-arrow is-prev"
            onClick={(e) => {
              e.stopPropagation();
              move(-1);
            }}
            aria-label="Previous"
          >
            ‹
          </button>
          {/* biome-ignore lint/performance/noImgElement: a static asset, not a photo */}
          <img src={`/sample/page-${open + 1}.png`} alt={labels[open]} />
          <button
            type="button"
            className="lightbox-arrow is-next"
            onClick={(e) => {
              e.stopPropagation();
              move(1);
            }}
            aria-label="Next"
          >
            ›
          </button>
          <p className="caption">{labels[open]}</p>
        </div>
      ) : null}
    </>
  );
}
