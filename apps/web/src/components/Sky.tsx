'use client';

import { useEffect, useRef } from 'react';

const TILE = 512;
/** Second layer at a different size so the two patterns only repeat together far off-screen. */
const TILE_ALT = 347;

/** Draw a seamless star tile: stars near an edge are repeated on the opposite one. */
function starTile(size: number, count: number, seed: number, dpr: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  let state = seed;
  const rnd = () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };

  for (let i = 0; i < count; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = rnd() < 0.08 ? 1.3 : rnd() < 0.5 ? 0.9 : 0.6;
    const alpha = 0.15 + rnd() * 0.55;
    ctx.fillStyle = rnd() < 0.12 ? `rgba(240,200,140,${alpha})` : `rgba(220,228,255,${alpha})`;
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        ctx.beginPath();
        ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  return canvas.toDataURL('image/png');
}

/** Star field behind the page.
 *
 * A tiled background rather than one canvas: the layer is as tall as the document, so the sky
 * never stops halfway down a long page (which is exactly what a scrolling screenshot shows).
 */
export function Sky() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sky = ref.current;
    if (!sky) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const near = starTile(TILE, 30, 7, dpr);
    const far = starTile(TILE_ALT, 14, 13, dpr);
    if (!near || !far) return;
    sky.style.backgroundImage = `url(${near}), url(${far})`;
    sky.style.backgroundSize = `${TILE}px ${TILE}px, ${TILE_ALT}px ${TILE_ALT}px`;
  }, []);

  return <div className="sky" ref={ref} aria-hidden="true" />;
}
