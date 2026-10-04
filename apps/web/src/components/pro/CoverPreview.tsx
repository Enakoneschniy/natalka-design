'use client';

import { useEffect, useRef } from 'react';
import { spacedName } from '@/lib/pro/brand';

/** A stand-in chart wheel on the night sky, the planets in the accent. Not a real chart: it only
 * shows where the wheel sits and how the colour reads. Same seed every time, so it never jumps. */
function drawWheel(canvas: HTMLCanvasElement, accent: string): void {
  const g = canvas.getContext('2d');
  if (!g) return;
  const w = canvas.width;
  const h = canvas.height;
  g.clearRect(0, 0, w, h);
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 140; i++) {
    g.fillStyle = `rgba(244,241,232,${0.15 + rnd() * 0.5})`;
    g.beginPath();
    g.arc(rnd() * w, rnd() * h, rnd() * 1.2 + 0.3, 0, Math.PI * 2);
    g.fill();
  }
  const cx = w / 2;
  const cy = h * 0.36;
  const r = w * 0.38;
  g.strokeStyle = 'rgba(255,255,255,.22)';
  g.lineWidth = 1;
  for (const radius of [r, r * 0.83, r * 0.45]) {
    g.beginPath();
    g.arc(cx, cy, radius, 0, Math.PI * 2);
    g.stroke();
  }
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * r * 0.83, cy + Math.sin(a) * r * 0.83);
    g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    g.stroke();
  }
  const points = [0.3, 1.1, 1.9, 2.4, 3.3, 4.1, 4.8, 5.6].map(
    (a) => [cx + Math.cos(a) * r * 0.64, cy + Math.sin(a) * r * 0.64] as const,
  );
  const lines = (colour: string, pairs: [number, number][]) => {
    g.strokeStyle = colour;
    for (const [from, to] of pairs) {
      const a = points[from];
      const b = points[to];
      if (!a || !b) continue;
      g.beginPath();
      g.moveTo(a[0], a[1]);
      g.lineTo(b[0], b[1]);
      g.stroke();
    }
  };
  lines('rgba(130,187,255,.45)', [
    [0, 3],
    [1, 5],
    [2, 6],
    [4, 7],
  ]);
  lines('rgba(255,125,104,.45)', [
    [0, 4],
    [3, 6],
  ]);
  g.fillStyle = accent;
  for (const [x, y] of points) {
    g.beginPath();
    g.arc(x, y, 3, 0, Math.PI * 2);
    g.fill();
  }
}

/** The PDF cover in miniature, kept in step with the form: brand name (or logo) in the accent,
 * the rule and diamond, the product, a sample client, the date and the first contact. */
export function CoverPreview({
  name,
  accent,
  logoSrc,
  contact,
  date,
}: {
  name: string;
  accent: string;
  logoSrc: string | null;
  contact: string;
  date: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvas.current) drawWheel(canvas.current, accent);
  }, [accent]);

  const wordmark = spacedName(name) || 'В А Ш Е   И М Я';
  return (
    <figure
      className="cover"
      style={{ '--brand': accent } as React.CSSProperties}
      aria-label="Предпросмотр обложки"
    >
      <canvas ref={canvas} width={400} height={565} />
      {logoSrc ? (
        // biome-ignore lint/performance/noImgElement: a private, uncached proxy stream; next/image cannot fetch it
        <img className="logo" src={logoSrc} alt="Логотип" />
      ) : (
        <span className="bname">{wordmark}</span>
      )}
      <span className="rule" />
      <span className="ttl">Натальная карта</span>
      <span className="who">Анна</span>
      <span className="ft">{contact ? `${date} · ${contact}` : date}</span>
    </figure>
  );
}
