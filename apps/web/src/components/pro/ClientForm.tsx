'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { maskDate, maskInput, maskTime } from '@/lib/birth-input';
import {
  type ClientDraft,
  type ClientField,
  checkClient,
  clientBody,
  clientFieldError,
  GENDERS,
  NAME_MAX,
} from '@/lib/pro/birth';
import { CitySearch } from './CitySearch';
import { useLang, useText } from './Lang';
import { sendJson, signInAgain } from './post';

type Errors = Partial<Record<ClientField | 'form', string>>;

/** A new client: name, birth date and time, city, gender and the seller's word that the client
 * agreed. Checked here by the same rules the jobs worker applies, then saved. */
export function ClientForm() {
  const router = useRouter();
  const lang = useLang();
  const t = useText();
  const [draft, setDraft] = useState<ClientDraft>({
    name: '',
    date: '',
    time: '',
    unknownTime: false,
    city: null,
    gender: 'female',
    consent: false,
  });
  const [errors, setErrors] = useState<Errors>({});
  const [sending, setSending] = useState(false);
  // State lands on the next render; two taps in one frame both see `sending` false.
  const inFlight = useRef(false);

  const patch = (fields: Partial<ClientDraft>) =>
    setDraft((current) => ({ ...current, ...fields }));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const local = checkClient(draft, lang);
    const body = clientBody(draft);
    setErrors(local);
    if (!body) return;
    inFlight.current = true;
    setSending(true);
    const { status, data } = await sendJson<{ id?: string; error?: string }>(
      '/api/pro/x/clients',
      'POST',
      body,
    );
    if (status === 201 && data?.id) {
      // The page is left; the button stays held until it is.
      router.push(`/clients/${data.id}`);
      return;
    }
    inFlight.current = false;
    setSending(false);
    if (status === 401) return signInAgain();
    if (status === 400 && data?.error === 'consent')
      return setErrors({ consent: clientFieldError('consent', lang) });
    if (status === 400) return setErrors({ form: t.clientForm.refused });
    setErrors({ form: t.common.tryLater });
  }

  const errorId = (field: ClientField) => `client-${field}-error`;
  const describe = (field: ClientField) => (errors[field] ? errorId(field) : undefined);
  const fieldError = (field: ClientField) =>
    errors[field] && (
      <span id={errorId(field)} className="field-error" role="alert">
        {errors[field]}
      </span>
    );

  return (
    <form className="form" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor="client-name">{t.clientForm.name}</label>
        <input
          id="client-name"
          className="input"
          autoComplete="off"
          maxLength={NAME_MAX}
          value={draft.name}
          onChange={(event) => patch({ name: event.target.value })}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={describe('name')}
        />
        {fieldError('name')}
      </div>
      <div className="two">
        <div className="field">
          <label htmlFor="client-date">{t.clientForm.birthDate}</label>
          <input
            id="client-date"
            className="input mono"
            inputMode="numeric"
            placeholder={t.clientForm.datePlaceholder}
            value={draft.date}
            onChange={(event) =>
              maskInput(event.currentTarget, maskDate, (date) => patch({ date }))
            }
            aria-invalid={errors.date ? true : undefined}
            aria-describedby={describe('date')}
          />
        </div>
        <div className="field">
          <label htmlFor="client-time">{t.clientForm.time}</label>
          <input
            id="client-time"
            className="input mono"
            inputMode="numeric"
            placeholder={t.clientForm.timePlaceholder}
            value={draft.unknownTime ? '' : draft.time}
            disabled={draft.unknownTime}
            onChange={(event) =>
              maskInput(event.currentTarget, maskTime, (time) => patch({ time }))
            }
            aria-invalid={errors.time ? true : undefined}
            aria-describedby={describe('time')}
          />
        </div>
      </div>
      {fieldError('date')}
      {fieldError('time')}
      <label className="check" htmlFor="client-unknown-time">
        <input
          id="client-unknown-time"
          type="checkbox"
          checked={draft.unknownTime}
          onChange={(event) => patch({ unknownTime: event.target.checked })}
        />
        <span>{t.clientForm.unknownTime}</span>
      </label>
      <div className="field">
        <label htmlFor="client-city">{t.clientForm.city}</label>
        <CitySearch
          id="client-city"
          value={draft.city}
          onChange={(city) => patch({ city })}
          error={errors.city}
          describedBy={describe('city')}
        />
        {fieldError('city')}
      </div>
      <fieldset className="field">
        <legend className="label">{t.clientForm.gender}</legend>
        <div className="seg">
          {GENDERS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={draft.gender === option}
              onClick={() => patch({ gender: option })}
            >
              {t.clientForm.genders[option]}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="field">
        <label className="check" htmlFor="client-consent">
          <input
            id="client-consent"
            type="checkbox"
            checked={draft.consent}
            onChange={(event) => patch({ consent: event.target.checked })}
            aria-invalid={errors.consent ? true : undefined}
            aria-describedby={describe('consent')}
          />
          <span>{t.clientForm.consent}</span>
        </label>
        {fieldError('consent')}
      </div>
      <button className="btn" type="submit" disabled={sending}>
        {sending ? t.common.saving : t.clientForm.submit}
      </button>
      {errors.form && (
        <p className="field-error" role="alert">
          {errors.form}
        </p>
      )}
    </form>
  );
}
