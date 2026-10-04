'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { sendJson, signInAgain, TRY_LATER } from './post';

/** «Удалить клиента», with a confirm step on the page itself: the client goes with every
 * reading they are in, and that cannot be undone. */
export function DeleteClient({ id }: { id: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancel = useRef<HTMLButtonElement>(null);

  // The question takes focus, on its safe answer, so a keyboard user lands on it.
  useEffect(() => {
    if (asking) cancel.current?.focus();
  }, [asking]);

  async function remove() {
    setDeleting(true);
    setError(null);
    const { status } = await sendJson(`/api/pro/x/clients/${encodeURIComponent(id)}`, 'DELETE');
    if (status === 401) return signInAgain();
    // 404: already gone, which is what the seller wanted.
    if (status === 200 || status === 404) {
      router.push('/clients');
      router.refresh();
      return;
    }
    setDeleting(false);
    setError(TRY_LATER);
  }

  if (!asking) {
    return (
      <button type="button" className="btn ghost danger start" onClick={() => setAsking(true)}>
        Удалить клиента
      </button>
    );
  }

  return (
    <div className="card confirm" role="alertdialog" aria-labelledby="delete-client-question">
      <p id="delete-client-question">Удалить клиента и все его отчёты? Это нельзя отменить.</p>
      <div className="row">
        <button type="button" className="btn danger" onClick={remove} disabled={deleting}>
          {deleting ? 'Удаляем…' : 'Удалить'}
        </button>
        <button
          ref={cancel}
          type="button"
          className="btn ghost"
          onClick={() => setAsking(false)}
          disabled={deleting}
        >
          Отмена
        </button>
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
