'use client';

import { useId, useRef, useState } from 'react';
import { imageError, imageProblem } from '@/lib/pro/brand';
import { useLang, useText } from './Lang';
import { putImage, sendJson, signInAgain } from './post';
import { prepareImage } from './prepare';

/** One brand picture (logo or photo): choose any picture and it is shrunk, saved as PNG or JPEG
 * and uploaded at once; a preview of what is stored, and «Удалить». The parent keeps whether a
 * picture exists and a version number, so the cover preview and this field show the same, freshly
 * uploaded image. */
export function ImageField({
  kind,
  label,
  hint,
  present,
  version,
  brandSaved,
  onChange,
}: {
  kind: 'logo' | 'photo';
  label: string;
  hint: string;
  present: boolean;
  version: number;
  brandSaved: boolean;
  onChange: (present: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const [state, setState] = useState<'idle' | 'uploading' | 'deleting'>('idle');
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const lang = useLang();
  const t = useText();
  const path = `/api/pro/x/brand/${kind}`;

  async function choose(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || busy.current) return;
    if (!brandSaved) return setError(t.brand.image.noBrand);
    const problem = imageProblem(file, lang);
    if (problem) return setError(problem);
    busy.current = true;
    setError(null);
    setState('uploading');
    const prepared = await prepareImage(file, kind);
    if (!prepared) {
      busy.current = false;
      setState('idle');
      return setError(t.brand.image.unreadable);
    }
    const { status, error: code } = await putImage(path, prepared);
    busy.current = false;
    setState('idle');
    if (status === 200) return onChange(true);
    if (status === 401) return signInAgain();
    setError(imageError(status, code, lang));
  }

  async function remove() {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    setState('deleting');
    const { status } = await sendJson(path, 'DELETE');
    busy.current = false;
    setState('idle');
    if (status === 200) return onChange(false);
    if (status === 401) return signInAgain();
    setError(t.common.tryLater);
  }

  return (
    <div className="field image-field">
      <label htmlFor={id}>{label}</label>
      <div className="image-row">
        <div className={`thumb ${kind}`}>
          {present ? (
            // biome-ignore lint/performance/noImgElement: a private, uncached proxy stream; next/image cannot fetch it
            <img src={`${path}?v=${version}`} alt={label} />
          ) : (
            <span className="muted">{t.brand.image.none}</span>
          )}
        </div>
        <div className="image-acts">
          <input
            ref={input}
            id={id}
            className="visually-hidden"
            type="file"
            accept="image/*"
            onChange={choose}
            disabled={state !== 'idle'}
          />
          <button
            type="button"
            className="btn ghost small"
            onClick={() => input.current?.click()}
            disabled={state !== 'idle'}
          >
            {state === 'uploading'
              ? t.brand.image.uploading
              : present
                ? t.brand.image.replace
                : t.brand.image.upload}
          </button>
          {present ? (
            <button
              type="button"
              className="btn ghost small danger"
              onClick={remove}
              disabled={state !== 'idle'}
            >
              {state === 'deleting' ? t.common.deleting : t.common.delete}
            </button>
          ) : null}
        </div>
      </div>
      <span className="muted hint">{hint}</span>
      {error ? (
        <span className="field-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
