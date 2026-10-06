'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import type { SubscriptionView } from '@/lib/jobs';

const dmy = (iso: string) => iso.slice(0, 10).split('-').reverse().join('.');

export function SubscriptionPanel({ token, bot }: { token: string; bot: string }) {
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
        : view.status === 'ended'
          ? 'statusEnded'
          : 'statusCancelled',
  );
  // The free month is over (or the address was never confirmed): there is nothing to change,
  // pause or resume.
  const ended = view.status === 'ended' || view.status === 'pending';

  return (
    <div className="subscription">
      {/* The state of the subscription, then what it is doing, then the ways to change it —
          in that order, because that is the order the questions come in. */}
      <div className="card subscription-head">
        <div className="subscription-who">
          <strong>{view.name || view.email}</strong>
          <span className={`subscription-status is-${view.status}`}>{status}</span>
        </div>
        <dl className="subscription-facts">
          {view.status === 'active' ? (
            <div>
              <dt>{t('nextLabel')}</dt>
              <dd className="mono">{dmy(view.next_send_at)}</dd>
            </div>
          ) : null}
          {view.trial_ends_at && !ended ? (
            <div>
              <dt>{t('trialLabel')}</dt>
              <dd className="mono">{dmy(view.trial_ends_at)}</dd>
            </div>
          ) : null}
        </dl>

        {ended ? (
          <p className="muted">{t('endedBody')}</p>
        ) : (
          <>
            <div className="field">
              <span className="label">{t('cadence')}</span>
              <div className="segmented block">
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
            </div>
          </>
        )}
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
        <div className="card subscription-writing">
          <span className="subscription-spinner" aria-hidden="true" />
          <p className="muted">{t('writing')}</p>
        </div>
      ) : null}

      {bot && !ended ? (
        <a
          className="card subscription-telegram"
          href={`https://t.me/${bot}?start=${view.telegram_code}`}
          target="_blank"
          rel="noreferrer"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M21.4 4.6 3.6 11.5c-1.2.5-1.2 1.2-.2 1.5l4.5 1.4 1.7 5.3c.2.6.4.8.8.8.4 0 .6-.2 1-.5l2.5-2.4 4.6 3.4c.8.5 1.4.2 1.6-.8l3-14c.3-1.2-.5-1.8-1.7-1.6ZM8.8 14l9.6-6.1c.5-.3.9-.1.5.2L11 15.4l-.3 3.3L8.8 14Z" />
          </svg>
          <span>
            <strong>{t('telegramTitle')}</strong>
            <span className="muted">{t('telegramBody')}</span>
          </span>
          <span className="subscription-chevron" aria-hidden="true">
            →
          </span>
        </a>
      ) : null}

      <details className="card subscription-data">
        <summary>
          <span>{t('birth')}</span>
          <span className="mono muted">
            {view.birth ? dmy(view.birth.date) : t('birthGoneShort')}
          </span>
        </summary>
        <div className="subscription-data-body">
          {view.birth ? (
            <>
              <p className="mono">
                {[dmy(view.birth.date), view.birth.time, view.birth.place]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <p className="caption">
                {view.correction_until
                  ? t('birthKept', { date: dmy(view.correction_until) })
                  : null}
              </p>
              <p className="caption">{t('contact')}</p>
            </>
          ) : (
            <p className="caption">{t('birthGone')}</p>
          )}
          <button
            className="btn btn-secondary is-danger"
            type="button"
            disabled={busy}
            onClick={remove}
          >
            {t('delete')}
          </button>
        </div>
      </details>
    </div>
  );
}
