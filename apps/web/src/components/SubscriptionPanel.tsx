'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import type { SubscriptionView } from '@/lib/jobs';

const dmy = (iso: string) => iso.slice(0, 10).split('-').reverse().join('.');

export function SubscriptionPanel({
  token,
  locale,
  bot,
}: {
  token: string;
  locale: string;
  bot: string;
}) {
  const t = useTranslations('subscription');
  const [view, setView] = useState<SubscriptionView | null>(null);
  const [gone, setGone] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/subscriptions/${encodeURIComponent(token)}`, {
      cache: 'no-store',
    });
    if (response.status === 404) {
      setGone(true);
      return null;
    }
    const data = (await response.json()) as SubscriptionView;
    setView(data);
    return data;
  }, [token]);

  // Poll only while the first horoscope is still being written.
  useEffect(() => {
    let active = true;
    let timer = 0;
    const tick = async () => {
      const data = await load().catch(() => null);
      if (active && data && !data.latest && data.status === 'active') {
        timer = window.setTimeout(tick, 5000);
      }
    };
    void tick();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [load]);

  const change = async (body: { cadence?: string; status?: string }) => {
    setBusy(true);
    await fetch(`/api/subscriptions/${encodeURIComponent(token)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    await load();
    setBusy(false);
  };

  const remove = async () => {
    if (!window.confirm(t('deleteConfirm'))) return;
    setBusy(true);
    await fetch(`/api/subscriptions/${encodeURIComponent(token)}`, { method: 'DELETE' });
    setDeleted(true);
    setBusy(false);
  };

  if (deleted) return <p className="explain">{t('deleted')}</p>;
  if (gone) return <p className="explain">{t('gone')}</p>;
  if (!view) return <p className="muted">…</p>;

  const status = t(
    view.status === 'active'
      ? 'statusActive'
      : view.status === 'paused'
        ? 'statusPaused'
        : 'statusCancelled',
  );

  return (
    <div className="stack subscription">
      <div className="card">
        <div className="item">
          <div>
            <strong>{view.name || view.email}</strong>
            <span className="muted">
              {status}
              {view.status === 'active'
                ? ` · ${t('nextSend', { date: dmy(view.next_send_at) })}`
                : ''}
            </span>
          </div>
          {view.trial_ends_at ? (
            <span className="mono muted">{t('trialUntil', { date: dmy(view.trial_ends_at) })}</span>
          ) : null}
        </div>
        <div className="segmented block" role="group" aria-label={t('cadence')}>
          {(['week', 'month'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={view.cadence === option}
              disabled={busy}
              onClick={() => change({ cadence: option })}
            >
              {t(option)}
            </button>
          ))}
        </div>
        <div className="subscription-actions">
          {view.status === 'active' ? (
            <button
              className="btn btn-secondary"
              type="button"
              disabled={busy}
              onClick={() => change({ status: 'paused' })}
            >
              {t('pause')}
            </button>
          ) : (
            <button
              className="btn btn-primary"
              type="button"
              disabled={busy}
              onClick={() => change({ status: 'active' })}
            >
              {t('resume')}
            </button>
          )}
          {view.status !== 'cancelled' ? (
            <button
              className="btn btn-secondary"
              type="button"
              disabled={busy}
              onClick={() => change({ status: 'cancelled' })}
            >
              {t('cancel')}
            </button>
          ) : null}
          <button
            className="btn btn-secondary is-danger"
            type="button"
            disabled={busy}
            onClick={remove}
          >
            {t('delete')}
          </button>
        </div>
      </div>

      {view.latest ? (
        <article className="card horoscope">
          <p className="caption mono">
            {t('latestFor', { start: dmy(view.latest.start), end: dmy(view.latest.end) })}
          </p>
          <h2>{view.latest.title}</h2>
          {view.latest.text.split(/\n\s*\n/).map((paragraph) => (
            <p key={paragraph.slice(0, 40)}>{paragraph}</p>
          ))}
        </article>
      ) : view.status === 'active' ? (
        <div className="card">
          <p className="muted">{t('writing')}</p>
        </div>
      ) : null}

      {bot ? (
        <div className="card">
          <h2 className="block-title">{t('telegramTitle')}</h2>
          <p className="muted">{t('telegramBody')}</p>
          <p>
            <a
              className="btn btn-secondary telegram-link"
              href={`https://t.me/${bot}?start=${view.telegram_code}`}
              target="_blank"
              rel="noreferrer"
            >
              {t('telegramOpen')}
            </a>
          </p>
        </div>
      ) : null}

      <div className="card">
        <h2 className="block-title">{t('birth')}</h2>
        {view.birth ? (
          <>
            <p className="mono muted">
              {[dmy(view.birth.date), view.birth.time, view.birth.place]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <p className="caption">
              {view.correction_until ? t('birthKept', { date: dmy(view.correction_until) }) : null}
            </p>
            <p className="caption">{t('contact')}</p>
          </>
        ) : (
          <p className="caption">{t('birthGone')}</p>
        )}
      </div>
    </div>
  );
}
