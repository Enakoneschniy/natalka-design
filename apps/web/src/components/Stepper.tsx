import { useTranslations } from 'next-intl';

const STEPS = ['data', 'preview', 'payment'] as const;

/** Three-step progress marker shown above the form and the preview. */
export function Stepper({ current }: { current: (typeof STEPS)[number] }) {
  const t = useTranslations('form.steps');
  const index = STEPS.indexOf(current);
  return (
    <ol className="stepper" aria-label={`${index + 1} / ${STEPS.length}`}>
      {STEPS.map((step, i) => (
        <li key={step} className="stepper-item">
          {i > 0 ? <span className="sep" /> : null}
          <span className={`st${i === index ? ' is-active' : i < index ? ' is-done' : ''}`}>
            <span className="n">{i + 1}</span>
            <span>{t(step)}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
