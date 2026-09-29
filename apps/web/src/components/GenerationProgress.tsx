'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

interface Status {
  step: string;
  status: string;
  written: number;
  total: number;
  progress: number;
  error: string | null;
  pages: number | null;
  download: string | null;
}

/** The three things that happen, in order. The dial shows how far along the whole document is;
 * this row shows which part of it is moving right now. */
const STAGES = ['calc', 'texts', 'pdf'] as const;

const RADIUS = 86;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** A slow celestial dial: two rings turning against each other, a gold arc for the progress and a
 * dot travelling along it. Fifteen minutes of waiting need something that looks alive — a bar that
 * does not move for a minute reads as a page that has frozen. */
function Dial({ progress, label, done }: { progress: number; label: string; done: boolean }) {
  const fraction = done ? 1 : Math.max(0.02, progress / 100);
  return (
    <div
      className={`dial${done ? ' is-done' : ''}`}
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(progress)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <defs>
          <radialGradient id="dial-halo">
            <stop offset="0%" stopColor="rgba(124, 92, 230, 0.34)" />
            <stop offset="65%" stopColor="rgba(74, 95, 224, 0.12)" />
            <stop offset="100%" stopColor="rgba(74, 95, 224, 0)" />
          </radialGradient>
        </defs>
        <circle className="dial-halo" cx="100" cy="100" r="84" fill="url(#dial-halo)" />
        <circle className="dial-ticks" cx="100" cy="100" r="96" />
        <circle className="dial-ticks dial-ticks-inner" cx="100" cy="100" r="70" />
        <circle className="dial-track" cx="100" cy="100" r={RADIUS} />
        <circle
          className="dial-arc"
          cx="100"
          cy="100"
          r={RADIUS}
          strokeDasharray={CIRCUMFERENCE}
          style={{ strokeDashoffset: CIRCUMFERENCE * (1 - fraction) }}
        />
        <g className="dial-dot" style={{ transform: `rotate(${fraction * 360}deg)` }}>
          <circle cx="100" cy={100 - RADIUS} r="7" className="dial-dot-glow" />
          <circle cx="100" cy={100 - RADIUS} r="3.4" />
        </g>
      </svg>
      <div className="dial-face">
        {done ? (
          <svg className="dial-check" viewBox="0 0 32 32" aria-hidden="true">
            <path d="M6 17l6.5 6.5L26 10" />
          </svg>
        ) : (
          <span className="dial-value mono">{Math.round(progress)}%</span>
        )}
      </div>
    </div>
  );
}

/** Polls until the document exists. A reading takes fifteen minutes, so the page says where it is
 * rather than spinning: people close a tab that looks stuck. */
export function GenerationProgress({
  token,
  telegram,
}: {
  token: string;
  telegram: string | null;
}) {
  const t = useTranslations('generating');
  const [status, setStatus] = useState<Status | null>(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    let active = true;
    const tick = async () => {
      try {
        const response = await fetch(`/api/jobs/${encodeURIComponent(token)}`, {
          cache: 'no-store',
        });
        if (response.status === 404) {
          if (active) setGone(true);
          return;
        }
        const data = (await response.json()) as Status;
        if (!active) return;
        setStatus(data);
        if (data.step !== 'done' && data.status !== 'failed') setTimeout(tick, 5000);
      } catch {
        if (active) setTimeout(tick, 10000);
      }
    };
    void tick();
    return () => {
      active = false;
    };
  }, [token]);

  if (gone) {
    return (
      <div className="waiting-text">
        <h1>{t('goneTitle')}</h1>
        <p className="lead">{t('noToken')}</p>
      </div>
    );
  }

  if (status?.status === 'failed') {
    return (
      <div className="waiting-text">
        <h1>{t('failedTitle')}</h1>
        <p className="lead">{t('failedBody')}</p>
      </div>
    );
  }

  const done = status?.step === 'done';
  const step = status?.step ?? 'calc';
  const label = !status
    ? t('starting')
    : done
      ? t('readyTitle')
      : step === 'calc'
        ? t('stepCalc')
        : step === 'pdf'
          ? t('stepPdf')
          : t('stepTexts', { written: status.written, total: status.total });

  // Where the row of stages stands: everything before the current one is behind us.
  const at = STAGES.indexOf(step as (typeof STAGES)[number]);
  const current = done ? STAGES.length : Math.max(at, 0);

  return (
    <div className="waiting">
      <Dial progress={status?.progress ?? 0} label={label} done={done} />

      <div className="waiting-text">
        <h1>{done ? t('readyTitle') : t('title')}</h1>
        {/* The label changes every few minutes; keying it restarts the fade so the change is seen. */}
        <p className="lead fade-in" key={label}>
          {done ? t('readyBody', { pages: status?.pages ?? 0 }) : label}
        </p>
      </div>

      {done ? (
        <Link
          className="btn btn-primary btn-lg"
          href={`/api/documents/${encodeURIComponent(token)}`}
          prefetch={false}
        >
          {t('open')}
        </Link>
      ) : (
        <>
          <ol className="stages">
            {STAGES.map((stage, index) => (
              <li
                key={stage}
                className={index < current ? 'is-done' : index === current ? 'is-active' : ''}
              >
                <span className="stage-dot" />
                {t(`stage.${stage}`)}
              </li>
            ))}
          </ol>
          <p className="caption waiting-note">{t('lead')}</p>
          {telegram ? (
            <a
              className="btn btn-secondary telegram-link"
              href={telegram}
              target="_blank"
              rel="noreferrer"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M21.4 4.6 3.6 11.5c-1.2.5-1.2 1.2-.2 1.5l4.5 1.4 1.7 5.3c.2.6.4.8.8.8.4 0 .6-.2 1-.5l2.5-2.4 4.6 3.4c.8.5 1.4.2 1.6-.8l3-14c.3-1.2-.5-1.8-1.7-1.6ZM8.8 14l9.6-6.1c.5-.3.9-.1.5.2L11 15.4l-.3 3.3L8.8 14Z" />
              </svg>
              {t('telegram')}
            </a>
          ) : null}
        </>
      )}
    </div>
  );
}
