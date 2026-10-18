'use client';

import { useText } from '@/components/pro/Lang';

/** Anything that breaks while a cabinet page renders lands here, inside the cabinet's own root. */
export default function ProError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useText().error;
  return (
    <main className="screen plain auth">
      <div className="intro">
        <span className="eyebrow">Chronika Pro</span>
        <h1>{t.title}</h1>
        <p className="muted">{t.text}</p>
      </div>
      <button type="button" className="btn" onClick={() => reset()}>
        {t.retry}
      </button>
    </main>
  );
}
