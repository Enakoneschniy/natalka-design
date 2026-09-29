'use client';

import { useCallback, useEffect, useState } from 'react';

/** Four pages of a finished document. Clicking one opens it over the page rather than in a new
 * tab: a reader who leaves the landing to look at a screenshot has to find their way back. */
export function SampleGallery({ labels }: { labels: string[] }) {
  const [open, setOpen] = useState<number | null>(null);

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
    // The page behind must not scroll under the image.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, close, move]);

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
        // biome-ignore lint/a11y/noStaticElementInteractions: the backdrop closes on click, and Escape does the same
        // biome-ignore lint/a11y/useKeyWithClickEvents: the key handler is on the document while this is open
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={labels[open]}
          onClick={close}
        >
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
          <img
            src={`/sample/page-${open + 1}.png`}
            alt={labels[open]}
            onClick={(e) => e.stopPropagation()}
          />
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
