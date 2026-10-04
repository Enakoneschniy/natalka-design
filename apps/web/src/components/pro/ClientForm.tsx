'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { maskDate, maskTime } from '@/lib/birth-input';
import {
  type ClientDraft,
  type ClientField,
  checkClient,
  clientBody,
  FIELD_ERROR,
  GENDERS,
  NAME_MAX,
} from '@/lib/pro/birth';
import { CitySearch } from './CitySearch';
import { sendJson, signInAgain, TRY_LATER } from './post';

type Errors = Partial<Record<ClientField | 'form', string>>;

const BIRTH_REFUSED = 'Проверьте дату, время и город: сервер их не принял.';

/** A new client: name, birth date and time, city, gender and the seller's word that the client
 * agreed. Checked here by the same rules the jobs worker applies, then saved. */
export function ClientForm() {
  const router = useRouter();
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
    const local = checkClient(draft);
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
      return setErrors({ consent: FIELD_ERROR.consent });
    if (status === 400) return setErrors({ form: BIRTH_REFUSED });
    setErrors({ form: TRY_LATER });
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
        <label htmlFor="client-name">Имя (так будет в разборе)</label>
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
          <label htmlFor="client-date">Дата рождения</label>
          <input
            id="client-date"
            className="input mono"
            inputMode="numeric"
            placeholder="дд.мм.гггг"
            value={draft.date}
            onChange={(event) => patch({ date: maskDate(event.target.value) })}
            aria-invalid={errors.date ? true : undefined}
            aria-describedby={describe('date')}
          />
        </div>
        <div className="field">
          <label htmlFor="client-time">Время</label>
          <input
            id="client-time"
            className="input mono"
            inputMode="numeric"
            placeholder="чч:мм"
            value={draft.unknownTime ? '' : draft.time}
            disabled={draft.unknownTime}
            onChange={(event) => patch({ time: maskTime(event.target.value) })}
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
        <span>Время неизвестно (разбор без домов и асцендента)</span>
      </label>
      <div className="field">
        <label htmlFor="client-city">Город рождения</label>
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
        <legend className="label">Пол (для окончаний в тексте)</legend>
        <div className="seg">
          {GENDERS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={draft.gender === option.value}
              onClick={() => patch({ gender: option.value })}
            >
              {option.label}
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
          <span>У меня есть согласие клиента на обработку его данных рождения</span>
        </label>
        {fieldError('consent')}
      </div>
      <button className="btn" type="submit" disabled={sending}>
        {sending ? 'Сохраняем…' : 'Сохранить клиента'}
      </button>
      {errors.form && (
        <p className="field-error" role="alert">
          {errors.form}
        </p>
      )}
    </form>
  );
}
