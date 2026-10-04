'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPoller } from '@/lib/pro/poll';
import {
  applyRewrite,
  assembleError,
  dockState,
  editLine,
  missingNote,
  needsPolling,
  pdfBuildFailed,
  type ReadingSection,
  type ReadingView,
  readingPill,
  rewriteError,
  roman,
  sectionsLabel,
} from '@/lib/pro/readings';
import { sendJson, signInAgain } from './post';
import { ReportDialog } from './ReportDialog';
import { SectionText } from './SectionText';

const POLL_MS = 5000;

type RowState = { busy: boolean; error?: string };

/** One reading: its sections in plan order, each to read in full, rewrite or flag; the sections
 * that could not be written, to fill free; and the dock under it all — progress while writing,
 * then «Собрать PDF», then the download. While the texts are written or the PDF assembled, the
 * page asks again every five seconds, with one timer at most, stopped when it unmounts. */
export function Reading({ initial, title }: { initial: ReadingView; title: string }) {
  const [view, setView] = useState(initial);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [reporting, setReporting] = useState<{ id: string; title: string } | null>(null);
  const [dockBusy, setDockBusy] = useState(false);
  const [dockError, setDockError] = useState<{ text: string; brand: boolean } | null>(null);
  const [gone, setGone] = useState(false);
  // Sections with a rewrite on its way: state lands a render late, a ref holds at once.
  const inFlight = useRef<Set<string>>(new Set());
  // Set when this page asked for the PDF, so a build that ends with none can be said out loud.
  const assembling = useRef(false);
  const lastPdf = useRef(view.pdf);
  const id = view.id;
  const polling = needsPolling(view) && !gone;

  /** One look at the reading; true when it came back. */
  const reload = useCallback(async (): Promise<boolean> => {
    const { status, data } = await sendJson<ReadingView>(`/api/pro/x/readings/${id}`, 'GET');
    if (status === 401) {
      signInAgain();
      return false;
    }
    if (status !== 200 || !data) return false;
    setView(data);
    return true;
  }, [id]);

  useEffect(() => {
    if (!polling) return;
    // Signed out or deleted: nothing more to ask, not even when the tab comes back.
    let over = false;
    const poller = createPoller<ReadingView | null>({
      intervalMs: POLL_MS,
      tick: async () => {
        const { status, data } = await sendJson<ReadingView>(`/api/pro/x/readings/${id}`, 'GET');
        if (status === 401) {
          over = true;
          signInAgain();
          return null;
        }
        if (status === 404) {
          over = true;
          setGone(true);
          return null;
        }
        if (status !== 200 || !data) throw new Error(`reading → ${status}`);
        setView(data);
        return data;
      },
      shouldStop: (data) => over || data === null || !needsPolling(data),
    });
    // A hidden tab asks nothing; it picks up again when shown. One poller, so one timer.
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') poller.stop();
      else if (!over) poller.start();
    };
    if (document.visibilityState !== 'hidden') poller.start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      poller.stop();
    };
  }, [id, polling]);

  useEffect(() => {
    if (pdfBuildFailed(lastPdf.current, view.pdf) && assembling.current) {
      setDockError({ text: 'Не удалось собрать PDF, попробуйте ещё раз', brand: false });
    }
    if (view.pdf !== 'building') assembling.current = false;
    lastPdf.current = view.pdf;
  }, [view.pdf]);

  const setRow = (sectionId: string, state: RowState) =>
    setRows((current) => ({ ...current, [sectionId]: state }));

  async function regenerate(sectionId: string) {
    if (inFlight.current.has(sectionId)) return;
    inFlight.current.add(sectionId);
    setRow(sectionId, { busy: true });
    const { status, data } = await sendJson<{
      section?: ReadingSection;
      regenerations_left?: number;
      error?: string;
    }>(`/api/pro/x/readings/${id}/sections/${sectionId}/regenerate`, 'POST');
    if (status === 401) return signInAgain();
    if (status !== 200 || !data?.section) {
      inFlight.current.delete(sectionId);
      setRow(sectionId, { busy: false, error: rewriteError(status, data?.error) });
      return;
    }
    const section = data.section;
    // In step at once, whatever the next look says: the text, the counter, and no PDF.
    setView((current) => applyRewrite(current, section, data.regenerations_left));
    inFlight.current.delete(sectionId);
    setRow(sectionId, { busy: false });
    // The reading's own answer puts a filled section in its plan position.
    await reload();
  }

  async function assemble() {
    setDockBusy(true);
    setDockError(null);
    const { status, data } = await sendJson<{ error?: string }>(
      `/api/pro/x/readings/${id}/pdf`,
      'POST',
    );
    setDockBusy(false);
    if (status === 401) return signInAgain();
    if (status === 202 || (status === 409 && data?.error === 'building')) {
      assembling.current = true;
      setView((current) => ({ ...current, pdf: 'building' }));
      return;
    }
    const error = status === 409 ? data?.error : undefined;
    setDockError({ text: assembleError(error), brand: error === 'no_brand' });
  }

  const toggle = (sectionId: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });

  if (gone) {
    return (
      <div className="card">
        <p>Отчёт не найден</p>
        <Link href="/" className="btn ghost small start">
          К отчётам
        </Link>
      </div>
    );
  }

  const ready = view.status === 'ready';
  const building = view.pdf === 'building';
  const canRewrite = ready && !view.frozen && !building;
  const dock = dockState(view);
  const pill = readingPill({ ...view, missing: view.missing.length });

  return (
    <>
      <div className="row head">
        <Link href="/" className="back" aria-label="Назад к отчётам">
          ‹
        </Link>
        <div className="grow">
          <h1 className="clip">{title}</h1>
          <p className="muted">
            {view.total > 0 ? `${sectionsLabel(view.total)} · ` : ''}
            {editLine(view)}
          </p>
        </div>
        <span className={`pill ${pill.tone}`}>{pill.label}</span>
      </div>

      {ready && view.missing.length > 0 ? (
        <ul className="sections" aria-label="Недописанные разделы">
          {view.missing.map((m) => {
            const row = rows[m.id];
            return (
              <li key={m.id} className="sec missing">
                <div className="h">
                  <span className="n" aria-hidden="true">
                    !
                  </span>
                  <h2>{m.title}</h2>
                </div>
                <p className="note">
                  Этот раздел не удалось написать. Допишем бесплатно, это не тратит перегенерации.
                </p>
                <div className="acts">
                  {row?.busy ? (
                    <span className="spin" role="status">
                      Дописываем… ~30 секунд
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="btn small"
                      disabled={building}
                      onClick={() => regenerate(m.id)}
                    >
                      Дописать
                    </button>
                  )}
                </div>
                {row?.error ? (
                  <p className="field-error" role="alert">
                    {row.error}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {view.sections.length > 0 ? (
        <ol className="sections" aria-label="Разделы">
          {view.sections.map((section, index) => {
            const row = rows[section.id];
            const expanded = open.has(section.id);
            return (
              <li key={section.id} className="sec" aria-busy={row?.busy || undefined}>
                <div className="h">
                  <span className="n" aria-hidden="true">
                    {roman(index + 1)}
                  </span>
                  <h2>{section.title}</h2>
                </div>
                {row?.busy ? (
                  <p className="spin" role="status">
                    Переписываем… ~30 секунд
                  </p>
                ) : (
                  <SectionText text={section.text} preview={!expanded} />
                )}
                <div className="acts">
                  <button
                    type="button"
                    className="btn ghost small"
                    aria-expanded={expanded}
                    onClick={() => toggle(section.id)}
                  >
                    {expanded ? 'Свернуть' : 'Читать'}
                  </button>
                  {canRewrite ? (
                    <button
                      type="button"
                      className="btn ghost small"
                      disabled={row?.busy || view.regenerations_left <= 0}
                      onClick={() => regenerate(section.id)}
                    >
                      Переписать
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn ghost small"
                    aria-label={`Сообщить о проблеме в разделе «${section.title}»`}
                    title="Сообщить о проблеме"
                    onClick={() => setReporting({ id: section.id, title: section.title })}
                  >
                    ⚑
                  </button>
                </div>
                {row?.error ? (
                  <p className="field-error" role="alert">
                    {row.error}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}

      <div className="dock" aria-live="polite">
        {dock === 'writing' ? (
          <>
            <p>
              Пишем разбор…{' '}
              <span className="num">
                {view.total > 0 ? `${view.written} из ${view.total}` : 'готовим план'}
              </span>
            </p>
            <span className="progress" aria-hidden="true">
              <i
                style={{
                  width: `${view.total > 0 ? Math.round((Math.min(view.written, view.total) / view.total) * 100) : 0}%`,
                }}
              />
            </span>
            <p className="muted">Можно закрыть страницу: разбор допишется сам.</p>
          </>
        ) : null}
        {dock === 'failed' ? (
          <p className="field-error">Не удалось написать разбор. Кредиты вернулись на счёт.</p>
        ) : null}
        {dock === 'missing' ? (
          <>
            <button type="button" className="btn" disabled>
              Собрать PDF
            </button>
            <p className="muted center">{missingNote(view.missing)}</p>
          </>
        ) : null}
        {dock === 'assemble' ? (
          <button type="button" className="btn" disabled={dockBusy} onClick={assemble}>
            {dockBusy ? 'Отправляем…' : 'Собрать PDF'}
          </button>
        ) : null}
        {dock === 'building' ? (
          <button type="button" className="btn" disabled>
            Собираем PDF…
          </button>
        ) : null}
        {dock === 'download' ? (
          <a className="btn" href={`/api/pro/x/readings/${id}/pdf`} download>
            Скачать PDF{view.pages ? ` · ${view.pages} стр.` : ''}
          </a>
        ) : null}
        {dockError ? (
          <p className="field-error center" role="alert">
            {dockError.text}
            {dockError.brand ? (
              <>
                {' '}
                <Link href="/brand">Открыть «Бренд»</Link>
              </>
            ) : null}
          </p>
        ) : null}
      </div>

      {reporting ? (
        <ReportDialog readingId={id} section={reporting} onClose={() => setReporting(null)} />
      ) : null}
    </>
  );
}
