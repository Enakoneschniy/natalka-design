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

/** Polls until the document exists. A reading takes fifteen minutes, so the page says where it is
 * rather than spinning: people close a tab that looks stuck. */
export function GenerationProgress({ token, locale }: { token: string; locale: string }) {
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

  if (gone) return <p className="explain">{t('noToken')}</p>;
  if (!status) return <p className="explain">{t('starting')}</p>;

  if (status.status === 'failed') {
    return (
      <div className="card">
        <h2 className="block-title">{t('failedTitle')}</h2>
        <p className="muted">{t('failedBody')}</p>
      </div>
    );
  }

  if (status.step === 'done') {
    return (
      <div className="card checkout-soon">
        <h2>{t('readyTitle')}</h2>
        <p className="muted">{t('readyBody', { pages: status.pages ?? 0 })}</p>
        <p>
          <Link
            className="btn btn-primary btn-lg"
            href={`/api/documents/${encodeURIComponent(token)}`}
            prefetch={false}
          >
            {t('open')}
          </Link>
        </p>
      </div>
    );
  }

  const label =
    status.step === 'calc'
      ? t('stepCalc')
      : status.step === 'pdf'
        ? t('stepPdf')
        : t('stepTexts', { written: status.written, total: status.total });

  return (
    <div className="card">
      <div
        className="progress"
        role="progressbar"
        aria-label={label}
        aria-valuenow={status.progress}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="progress-bar" style={{ width: `${Math.max(4, status.progress)}%` }} />
      </div>
      <p className="muted progress-label">{label}</p>
      <p className="caption">{t('keepOpen')}</p>
      <p className="caption mono muted">{locale}</p>
    </div>
  );
}
