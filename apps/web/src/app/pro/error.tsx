'use client';

/** Anything that breaks while a cabinet page renders lands here, inside the cabinet's own root. */
export default function ProError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="screen plain auth">
      <div className="intro">
        <span className="eyebrow">Chronika Pro</span>
        <h1>Что-то пошло не так</h1>
        <p className="muted">Попробуйте обновить страницу. Если не поможет — напишите нам.</p>
      </div>
      <button type="button" className="btn" onClick={() => reset()}>
        Обновить
      </button>
    </main>
  );
}
