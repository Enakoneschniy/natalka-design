'use client';

import { useEffect, useRef, useState } from 'react';
import { reportError } from '@/lib/pro/readings';
import { sendJson, signInAgain } from './post';

const COMMENT_MAX = 1000;

/** «Сообщить о проблеме» for one section: a note of up to 1000 characters for the owner to read.
 * Mounted open; closing it (the button, Esc or a tap outside) calls `onClose`. */
export function ReportDialog({
  readingId,
  section,
  onClose,
}: {
  readingId: string;
  section: { id: string; title: string };
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const node = dialog.current;
    // No close on cleanup: unmounting removes the dialog anyway, and a close here would fire
    // `onClose` during React's development double-mount and shut the dialog at once.
    if (node && !node.open) node.showModal();
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = comment.trim();
    if (!text) return setError(reportError(400));
    setSending(true);
    setError(null);
    const { status } = await sendJson<{ ok?: boolean }>(
      `/api/pro/x/readings/${readingId}/sections/${section.id}/report`,
      'POST',
      { comment: text },
    );
    setSending(false);
    if (status === 201) return setSent(true);
    if (status === 401) return signInAgain();
    setError(reportError(status));
  }

  return (
    // A click on the backdrop lands on the dialog itself; Esc is the keyboard's way out.
    // biome-ignore lint/a11y/useKeyWithClickEvents: Esc closes a modal dialog natively
    <dialog
      ref={dialog}
      className="sheet"
      aria-labelledby="report-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) dialog.current?.close();
      }}
    >
      {sent ? (
        <div className="form">
          <h2 id="report-title">Спасибо, посмотрим</h2>
          <p className="muted">Мы прочитаем ваше сообщение о разделе «{section.title}».</p>
          <button type="button" className="btn ghost" onClick={() => dialog.current?.close()}>
            Закрыть
          </button>
        </div>
      ) : (
        <form className="form" onSubmit={submit} noValidate>
          <h2 id="report-title">Что не так с разделом?</h2>
          <p className="muted">«{section.title}»</p>
          <div className="field">
            <label htmlFor="report-comment">Опишите проблему</label>
            <textarea
              id="report-comment"
              className="input"
              rows={5}
              maxLength={COMMENT_MAX}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              aria-describedby="report-count"
            />
            <span id="report-count" className="muted num">
              {comment.length} / {COMMENT_MAX}
            </span>
          </div>
          <div className="row">
            <button className="btn" type="submit" disabled={sending}>
              {sending ? 'Отправляем…' : 'Отправить'}
            </button>
            <button type="button" className="btn ghost" onClick={() => dialog.current?.close()}>
              Отмена
            </button>
          </div>
          {error ? (
            <p className="field-error" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      )}
    </dialog>
  );
}
