/* The city field is the WAI-ARIA combobox pattern: the input keeps focus and owns a listbox of
   options, which is exactly what these rules discourage on a ul/li. A <select> cannot search as
   you type, so the pattern stays and the rules are off for this file.
   biome-ignore-all lint/a11y/noNoninteractiveElementToInteractiveRole: combobox pattern
   biome-ignore-all lint/a11y/useFocusableInteractive: focus stays in the input
   biome-ignore-all lint/a11y/useSemanticElements: a <select> cannot search as you type */
'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { City } from '@/app/api/cities/route';
import { cityLabel, maskDate, maskTime } from '@/lib/birth-input';

export { cityLabel, maskDate, maskTime };

export type Gender = 'female' | 'male' | 'neutral';

export const GENDERS: Gender[] = ['female', 'male', 'neutral'];

export interface PersonState {
  name: string;
  gender: Gender;
  date: string;
  time: string;
  unknownTime: boolean;
  city: City | null;
  cityQuery: string;
}

export const emptyPerson = (): PersonState => ({
  name: '',
  gender: 'female',
  date: '',
  time: '',
  unknownTime: false,
  city: null,
  cityQuery: '',
});

function formatCoordinate(value: number, axis: 'lat' | 'lon', t: (key: string) => string): string {
  const degrees = Math.floor(Math.abs(value));
  const minutes = Math.round((Math.abs(value) - degrees) * 60);
  const direction =
    axis === 'lat' ? (value >= 0 ? t('north') : t('south')) : value >= 0 ? t('east') : t('west');
  return `${degrees}°${String(minutes).padStart(2, '0')}′ ${direction}`;
}

/** One person's birth data. A synastry needs two of these, so it is a component rather than a
 * block of the form: two copies of three hundred lines is how the two halves drift apart. */
export function PersonFields({
  value,
  onChange,
  errors,
  legend,
  nameLabel,
  nameHint,
  genderLabel,
  genderHint,
  idPrefix,
}: {
  value: PersonState;
  onChange: (next: PersonState) => void;
  errors: Record<string, string>;
  legend?: string;
  nameLabel: string;
  nameHint: string;
  genderLabel: string;
  genderHint: string;
  idPrefix: string;
}) {
  const t = useTranslations('form');
  const listId = useId();
  const box = useRef<HTMLDivElement>(null);
  const seen = useRef(new Map<string, City[]>());

  const [options, setOptions] = useState<City[]>([]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);

  const patch = (fields: Partial<PersonState>) => onChange({ ...value, ...fields });

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // One request per pause in typing; an aborted fetch never overwrites a newer result.
  const query = value.cityQuery.trim();
  const chosen = value.city;
  useEffect(() => {
    if (query.length < 2 || (chosen && query === cityLabel(chosen))) {
      setOptions([]);
      return;
    }
    const remembered = seen.current.get(query);
    if (remembered) {
      setOptions(remembered);
      setActive(0);
      setOpen(true);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/cities?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        const data = (await response.json()) as { cities: City[] };
        seen.current.set(query, data.cities ?? []);
        setOptions(data.cities ?? []);
        setActive(0);
        setOpen(true);
      } catch {
        /* aborted or offline — the field stays usable, submit validates anyway */
      }
      // Short: the search is a D1 query on the same request path, so the wait the visitor feels
      // is this timer plus a round trip.
    }, 120);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, chosen]);

  const choose = useCallback(
    (option: City) => {
      onChange({ ...value, city: option, cityQuery: cityLabel(option) });
      setOpen(false);
    },
    [onChange, value],
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || options.length === 0) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + step + options.length) % options.length);
    } else if (event.key === 'Enter') {
      const option = options[active];
      if (option) {
        event.preventDefault();
        choose(option);
      }
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="card person-card">
      {legend ? <h2 className="block-title person-legend">{legend}</h2> : null}

      <div className="field">
        <label className="label" htmlFor={`${idPrefix}-name`}>
          {nameLabel}
        </label>
        <input
          className="input"
          id={`${idPrefix}-name`}
          value={value.name}
          onChange={(e) => patch({ name: e.target.value })}
          autoComplete="given-name"
          maxLength={40}
        />
        <span className="hint">{nameHint}</span>
      </div>

      <div className="row-2">
        <div className="field">
          <label className="label" htmlFor={`${idPrefix}-date`}>
            {t('date')}
          </label>
          <input
            className={`input mono${errors.date ? ' is-error' : ''}`}
            id={`${idPrefix}-date`}
            value={value.date}
            onChange={(e) => patch({ date: maskDate(e.target.value) })}
            inputMode="numeric"
            placeholder={t('datePlaceholder')}
            aria-invalid={Boolean(errors.date)}
          />
          {errors.date ? <span className="hint is-error">{errors.date}</span> : null}
        </div>
        <div className="field">
          <label className="label" htmlFor={`${idPrefix}-time`}>
            {t('time')}
          </label>
          <input
            className={`input mono${errors.time ? ' is-error' : ''}`}
            id={`${idPrefix}-time`}
            value={value.unknownTime ? '' : value.time}
            onChange={(e) => patch({ time: maskTime(e.target.value) })}
            inputMode="numeric"
            placeholder={t('timePlaceholder')}
            disabled={value.unknownTime}
            aria-invalid={Boolean(errors.time)}
          />
          <span className={`hint${errors.time ? ' is-error' : ''}`}>
            {errors.time || t('timeHint')}
          </span>
        </div>
      </div>

      <div className="stack">
        <label className="check">
          <input
            type="checkbox"
            checked={value.unknownTime}
            onChange={(e) => patch({ unknownTime: e.target.checked })}
          />
          <span className="box">
            <svg
              viewBox="0 0 14 14"
              fill="none"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M2.5 7.5l3 3 6-7" />
            </svg>
          </span>
          <span>{t('unknownTime')}</span>
        </label>
        {value.unknownTime ? (
          <div className="explain">
            <strong>{t('unknownTimeTitle')}</strong> {t('unknownTimeBody')}
          </div>
        ) : null}
      </div>

      <div className="field">
        <label className="label" htmlFor={`${idPrefix}-city`}>
          {t('city')}
        </label>
        <div className="input-wrap" ref={box}>
          <input
            className={`input${errors.city ? ' is-error' : ''}`}
            id={`${idPrefix}-city`}
            value={value.cityQuery}
            onChange={(e) => patch({ cityQuery: e.target.value, city: null })}
            onKeyDown={onKeyDown}
            onFocus={() => options.length > 0 && setOpen(true)}
            autoComplete="off"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            placeholder={t('cityPlaceholder')}
          />
          <svg
            className="input-icon"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="9" cy="9" r="6" />
            <path d="M13.5 13.5L17 17" />
          </svg>
          {open && options.length > 0 ? (
            <ul className="suggest" id={listId} role="listbox">
              {options.map((option, index) => (
                <li
                  key={option.id}
                  role="option"
                  aria-selected={index === active}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(option);
                  }}
                  onMouseEnter={() => setActive(index)}
                >
                  <span>{option.name}</span>
                  <span className="muted">
                    {[option.region, option.country].filter(Boolean).join(' · ')}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {value.city ? (
          <div className="geo">
            <span>{formatCoordinate(value.city.latitude, 'lat', t)}</span>
            <span>{formatCoordinate(value.city.longitude, 'lon', t)}</span>
            <span>{value.city.zone}</span>
          </div>
        ) : null}
        <span className={`hint${errors.city ? ' is-error' : ''}`}>
          {errors.city || t('cityHint')}
        </span>
      </div>

      <div className="field">
        <span className="label">{genderLabel}</span>
        <div className="segmented block" role="group" aria-label={genderLabel}>
          {GENDERS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={value.gender === option}
              onClick={() => patch({ gender: option })}
            >
              {t(`genders.${option}`)}
            </button>
          ))}
        </div>
        <span className="hint">{genderHint}</span>
      </div>
    </div>
  );
}
