'use client';

import { useEffect, useRef } from 'react';

/** Star field behind the page: one canvas, painted once per resize, no animation loop. */
export function Sky() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const paint = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      let seed = 7;
      const rnd = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
      };
      const count = Math.round((w * h) / 9000);
      for (let i = 0; i < count; i++) {
        const x = rnd() * w;
        const y = rnd() * h;
        const r = rnd() < 0.08 ? 1.3 : rnd() < 0.5 ? 0.9 : 0.6;
        const alpha = 0.15 + rnd() * 0.55;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = rnd() < 0.12 ? `rgba(240,200,140,${alpha})` : `rgba(220,228,255,${alpha})`;
        ctx.fill();
      }
      if (reduce) return;
      // a few brighter stars that twinkle via CSS on top of the static field
      canvas.style.opacity = '0.9';
    };

    paint();
    let timer: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(paint, 150);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      clearTimeout(timer);
    };
  }, []);

  return (
    <div className="sky" aria-hidden="true">
      <canvas ref={ref} />
    </div>
  );
}
