'use client';

import { useRef, useState } from 'react';
import {
  ACCENTS,
  type BrandDraft,
  type BrandField,
  brandBody,
  brandSaveError,
  CONTACT_MAX,
  CONTACTS_MAX,
  checkBrand,
  isAccent,
  LOW_CONTRAST_WARNING,
  lowContrast,
  NAME_MAX,
  SIGNATURE_MAX,
  TEXT_MAX,
  TONE_SAMPLE,
  type Tone,
} from '@/lib/pro/brand';
import { CoverPreview } from './CoverPreview';
import { ImageField } from './ImageField';
import { sendJson, signInAgain } from './post';

type Errors = Partial<Record<BrandField | 'form', string>>;

interface Picture {
  present: boolean;
  version: number;
}

const TONES: { value: Tone; label: string }[] = [
  { value: 'vy', label: 'на «вы»' },
  { value: 'ty', label: 'на «ты»' },
];

/** The Бренд tab: a live cover preview over the brand form. Text fields are saved together with
 * «Сохранить»; the logo and photo upload on their own as soon as one is chosen. */
export function BrandForm({
  initial,
  saved: savedOnServer,
  logo,
  photo,
  date,
}: {
  initial: BrandDraft;
  saved: boolean;
  logo: boolean;
  photo: boolean;
  date: string;
}) {
  const [draft, setDraft] = useState<BrandDraft>(initial);
  const nextKey = useRef(initial.contacts.length);
  const [contactKeys, setContactKeys] = useState(() => initial.contacts.map((_, i) => i));
  const [shownAccent, setShownAccent] = useState(initial.accent);
  const [errors, setErrors] = useState<Errors>({});
  const [brandSaved, setBrandSaved] = useState(savedOnServer);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const saving = useRef(false);
  const [pictures, setPictures] = useState<Record<'logo' | 'photo', Picture>>({
    logo: { present: logo, version: 0 },
    photo: { present: photo, version: 0 },
  });

  const patch = (fields: Partial<BrandDraft>) => {
    setDraft((current) => ({ ...current, ...fields }));
    if (status === 'saved') setStatus('idle');
  };

  const setAccent = (value: string) => {
    patch({ accent: value });
    if (isAccent(value.trim())) setShownAccent(value.trim());
  };

  const setContact = (index: number, value: string) =>
    patch({ contacts: draft.contacts.map((line, i) => (i === index ? value : line)) });

  const addContact = () => {
    if (draft.contacts.length >= CONTACTS_MAX) return;
    patch({ contacts: [...draft.contacts, ''] });
    setContactKeys((keys) => [...keys, nextKey.current++]);
  };

  const removeContact = (index: number) => {
    patch({ contacts: draft.contacts.filter((_, i) => i !== index) });
    setContactKeys((keys) => keys.filter((_, i) => i !== index));
  };

  const picture = (kind: 'logo' | 'photo') => (present: boolean) =>
    setPictures((current) => ({
      ...current,
      [kind]: { present, version: current[kind].version + 1 },
    }));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current) return;
    const local = checkBrand(draft);
    const body = brandBody(draft);
    setErrors(local);
    if (!body) return;
    saving.current = true;
    setStatus('saving');
    const { status: answer, data } = await sendJson<{ error?: string }>(
      '/api/pro/x/brand',
      'PUT',
      body,
    );
    saving.current = false;
    if (answer === 200) {
      setBrandSaved(true);
      setStatus('saved');
      return;
    }
    setStatus('idle');
    if (answer === 401) return signInAgain();
    setErrors({ form: brandSaveError(answer, data?.error) });
  }

  const errorId = (field: BrandField) => `brand-${field}-error`;
  const describe = (field: BrandField, extra?: string) =>
    [errors[field] ? errorId(field) : undefined, extra].filter(Boolean).join(' ') || undefined;
  const fieldError = (field: BrandField) =>
    errors[field] && (
      <span id={errorId(field)} className="field-error" role="alert">
        {errors[field]}
      </span>
    );

  const firstContact = draft.contacts.map((line) => line.trim()).find(Boolean) ?? '';
  const swatchChosen = ACCENTS.some((c) => c.toLowerCase() === draft.accent.trim().toLowerCase());
  const dim = lowContrast(draft.accent.trim());

  return (
    <form className="form brand" onSubmit={submit} noValidate>
      <CoverPreview
        name={draft.name}
        accent={shownAccent}
        logoSrc={pictures.logo.present ? `/api/pro/x/brand/logo?v=${pictures.logo.version}` : null}
        contact={firstContact}
        date={date}
      />

      <div className="field">
        <label htmlFor="brand-name">Имя или название</label>
        <input
          id="brand-name"
          className="input"
          autoComplete="organization"
          maxLength={NAME_MAX}
          value={draft.name}
          onChange={(event) => patch({ name: event.target.value })}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={describe('name')}
        />
        {fieldError('name')}
      </div>

      <fieldset className="field">
        <legend className="label">Цвет акцента</legend>
        <div className="swatches">
          {ACCENTS.map((colour) => (
            <button
              key={colour}
              type="button"
              style={{ background: colour }}
              aria-label={`Цвет ${colour}`}
              aria-pressed={draft.accent.trim().toLowerCase() === colour.toLowerCase()}
              onClick={() => setAccent(colour)}
            />
          ))}
        </div>
        <div className="accent-row">
          <span
            className={`chip${swatchChosen ? '' : ' own'}`}
            style={{ background: shownAccent }}
            aria-hidden="true"
          />
          <input
            id="brand-accent"
            className="input mono"
            aria-label="Свой цвет, #RRGGBB"
            placeholder="#RRGGBB"
            maxLength={7}
            spellCheck={false}
            autoComplete="off"
            value={draft.accent}
            onChange={(event) => setAccent(event.target.value)}
            aria-invalid={errors.accent ? true : undefined}
            aria-describedby={describe('accent', dim ? 'brand-accent-dim' : undefined)}
          />
        </div>
        {dim ? (
          <span id="brand-accent-dim" className="warn">
            {LOW_CONTRAST_WARNING}
          </span>
        ) : null}
        {fieldError('accent')}
      </fieldset>

      <ImageField
        kind="logo"
        label="Логотип"
        hint="PNG или JPEG до 1 МБ. На обложке встанет вместо имени."
        present={pictures.logo.present}
        version={pictures.logo.version}
        brandSaved={brandSaved}
        onChange={picture('logo')}
      />

      <fieldset className="field">
        <legend className="label">Обращение к клиенту</legend>
        <div className="seg">
          {TONES.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={draft.tone === option.value}
              onClick={() => patch({ tone: option.value })}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="sample" aria-live="polite">
          {TONE_SAMPLE[draft.tone]}
        </p>
      </fieldset>

      <fieldset className="field">
        <legend className="label">Контакты (до {CONTACTS_MAX} строк)</legend>
        <div className="contacts">
          {draft.contacts.map((line, index) => (
            <div className="contact" key={contactKeys[index]}>
              <input
                className="input"
                aria-label={`Контакт ${index + 1}`}
                placeholder="@maria.stars, сайт или почта"
                maxLength={CONTACT_MAX}
                value={line}
                onChange={(event) => setContact(index, event.target.value)}
                aria-invalid={errors.contacts ? true : undefined}
                aria-describedby={describe('contacts')}
              />
              <button
                type="button"
                className="btn ghost small"
                aria-label={`Убрать контакт ${index + 1}`}
                onClick={() => removeContact(index)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        {draft.contacts.length < CONTACTS_MAX ? (
          <button type="button" className="btn ghost small start" onClick={addContact}>
            + Контакт
          </button>
        ) : null}
        {fieldError('contacts')}
      </fieldset>

      <ImageField
        kind="photo"
        label="Фото"
        hint="PNG или JPEG до 1 МБ. Встанет рядом со вступлением «От автора»."
        present={pictures.photo.present}
        version={pictures.photo.version}
        brandSaved={brandSaved}
        onChange={picture('photo')}
      />

      <TextArea
        field="intro"
        label="Вступление «От автора»"
        value={draft.intro}
        onChange={(intro) => patch({ intro })}
        error={fieldError('intro')}
        invalid={Boolean(errors.intro)}
        describedBy={describe('intro')}
      />
      <TextArea
        field="outro"
        label="Заключение"
        value={draft.outro}
        onChange={(outro) => patch({ outro })}
        error={fieldError('outro')}
        invalid={Boolean(errors.outro)}
        describedBy={describe('outro')}
      />

      <div className="field">
        <label htmlFor="brand-signature">Подпись</label>
        <input
          id="brand-signature"
          className="input"
          autoComplete="off"
          placeholder="С теплом, Мария"
          maxLength={SIGNATURE_MAX}
          value={draft.signature}
          onChange={(event) => patch({ signature: event.target.value })}
          aria-invalid={errors.signature ? true : undefined}
          aria-describedby={describe('signature')}
        />
        {fieldError('signature')}
      </div>

      <div className="row">
        <button className="btn" type="submit" disabled={status === 'saving'}>
          {status === 'saving' ? 'Сохраняем…' : 'Сохранить'}
        </button>
        <span className={status === 'saved' ? 'pill ok' : undefined} role="status">
          {status === 'saved' ? 'Сохранено' : ''}
        </span>
      </div>
      {errors.form ? (
        <p className="field-error" role="alert">
          {errors.form}
        </p>
      ) : null}
    </form>
  );
}

function TextArea({
  field,
  label,
  value,
  onChange,
  error,
  invalid,
  describedBy,
}: {
  field: 'intro' | 'outro';
  label: string;
  value: string;
  onChange: (value: string) => void;
  error: React.ReactNode;
  invalid: boolean;
  describedBy: string | undefined;
}) {
  const id = `brand-${field}`;
  const count = `${id}-count`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        className="input"
        rows={5}
        maxLength={TEXT_MAX}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={[describedBy, count].filter(Boolean).join(' ')}
      />
      <span id={count} className="muted num hint">
        {value.length} / {TEXT_MAX}
      </span>
      {error}
    </div>
  );
}
