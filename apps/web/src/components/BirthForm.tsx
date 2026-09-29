/* The city field is the WAI-ARIA combobox pattern: the input keeps focus and owns a listbox of
   options, which is exactly what these rules discourage on a ul/li. A <select> cannot search as
   you type, so the pattern stays and the rules are off for this file.
   biome-ignore-all lint/a11y/noNoninteractiveElementToInteractiveRole: combobox pattern
   biome-ignore-all lint/a11y/useFocusableInteractive: focus stays in the input
   biome-ignore-all lint/a11y/useSemanticElements: a <select> cannot search as you type */
'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { City } from '@/app/api/cities/route';

type Gender = 'female' | 'male' | 'neutral';

const GENDERS: Gender[] = ['female', 'male', 'neutral'];

/** dd.mm.yyyy → ISO, or null when the date does not exist (31.02, 1799, …). */
function parseDate(value: string): string | null {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [, dd, mm, yyyy] = match as unknown as [string, string, string, string];
  const iso = `${yyyy}-${mm}-${dd}`;
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.getUTCDate() !== Number(dd)) return null;
  if (Number(yyyy) < 1800 || Number(yyyy) > 2099) return null;
  return iso;
}

function parseTime(value: string): string | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, hh, mm] = match as unknown as [string, string, string];
  if (Number(hh) > 23 || Number(mm) > 59) return null;
  return `${hh.padStart(2, '0')}:${mm}`;
}

/** Keep the digits the user typed and insert the separators for them. */
function maskDate(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join('.');
}

function maskTime(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

export function BirthForm({ locale }: { locale: string }) {
  const t = useTranslations('form');
  const router = useRouter();
  const listId = useId();

  const [name, setName] = useState('');
  const [gender, setGender] = useState<Gender>('female');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [unknownTime, setUnknownTime] = useState(false);
  const [city, setCity] = useState<City | null>(null);
  const [cityQuery, setCityQuery] = useState('');
  const [options, setOptions] = useState<City[]>([]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const box = useRef<HTMLDivElement>(null);
  // Searches already made this session. Backspacing through a name is otherwise a fresh request
  // per keystroke for results we have already seen.
  const seen = useRef(new Map<string, City[]>());

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // One request per pause in typing; an aborted fetch never overwrites a newer result.
  useEffect(() => {
    const query = cityQuery.trim();
    if (query.length < 2 || (city && query === cityLabel(city))) {
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
  }, [cityQuery, city]);

  const choose = useCallback((option: City) => {
    setCity(option);
    setCityQuery(cityLabel(option));
    setOpen(false);
    setErrors((prev) => ({ ...prev, city: '' }));
  }, []);

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

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const iso = parseDate(date);
    const hhmm = unknownTime ? null : parseTime(time);
    const next: Record<string, string> = {};
    if (!iso) next.date = t('errors.date');
    if (!unknownTime && !hhmm) next.time = t('errors.time');
    if (!city) next.city = t('errors.city');
    setErrors(next);
    if (Object.keys(next).length > 0 || !iso || !city) return;

    const params = new URLSearchParams({
      d: iso,
      lat: city.latitude.toFixed(4),
      lon: city.longitude.toFixed(4),
      tz: city.zone,
      c: cityLabel(city),
      g: gender,
    });
    if (hhmm) params.set('t', hhmm);
    if (name.trim()) params.set('n', name.trim().slice(0, 40));
    setPending(true);
    router.push(`/${locale}/preview?${params.toString()}`);
  };

  return (
    <form className="form" onSubmit={submit} noValidate>
      <div className="card">
        <div className="field">
          <label className="label" htmlFor="name">
            {t('name')}
          </label>
          <input
            className="input"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="given-name"
            maxLength={40}
          />
          <span className="hint">{t('nameHint')}</span>
        </div>

        <div className="row-2">
          <div className="field">
            <label className="label" htmlFor="date">
              {t('date')}
            </label>
            <input
              className={`input mono${errors.date ? ' is-error' : ''}`}
              id="date"
              value={date}
              onChange={(e) => setDate(maskDate(e.target.value))}
              inputMode="numeric"
              placeholder={t('datePlaceholder')}
              aria-invalid={Boolean(errors.date)}
            />
            {errors.date ? <span className="hint is-error">{errors.date}</span> : null}
          </div>
          <div className="field">
            <label className="label" htmlFor="time">
              {t('time')}
            </label>
            <input
              className={`input mono${errors.time ? ' is-error' : ''}`}
              id="time"
              value={unknownTime ? '' : time}
              onChange={(e) => setTime(maskTime(e.target.value))}
              inputMode="numeric"
              placeholder={t('timePlaceholder')}
              disabled={unknownTime}
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
              checked={unknownTime}
              onChange={(e) => setUnknownTime(e.target.checked)}
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
          {unknownTime ? (
            <div className="explain">
              <strong>{t('unknownTimeTitle')}</strong> {t('unknownTimeBody')}
            </div>
          ) : null}
        </div>
      </div>

      <div className="card">
        <div className="field">
          <label className="label" htmlFor="city">
            {t('city')}
          </label>
          <div className="input-wrap" ref={box}>
            <input
              className={`input${errors.city ? ' is-error' : ''}`}
              id="city"
              value={cityQuery}
              onChange={(e) => {
                setCityQuery(e.target.value);
                setCity(null);
              }}
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
          {city ? (
            <div className="geo">
              <span>{formatCoordinate(city.latitude, 'lat', t)}</span>
              <span>{formatCoordinate(city.longitude, 'lon', t)}</span>
              <span>{city.zone}</span>
            </div>
          ) : null}
          <span className={`hint${errors.city ? ' is-error' : ''}`}>
            {errors.city || t('cityHint')}
          </span>
        </div>
      </div>

      <div className="card">
        <div className="field">
          <span className="label">{t('gender')}</span>
          <div className="segmented block" role="group" aria-label={t('gender')}>
            {GENDERS.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={gender === value}
                onClick={() => setGender(value)}
              >
                {t(`genders.${value}`)}
              </button>
            ))}
          </div>
          <span className="hint">{t('genderHint')}</span>
        </div>
      </div>

      <div className="form-foot">
        <button className="btn btn-primary btn-lg" type="submit" disabled={pending}>
          {pending ? t('submitPending') : t('submit')}
        </button>
        <span className="caption">{t('free')}</span>
      </div>
    </form>
  );
}

const cityLabel = (city: City): string =>
  [city.name, city.region, city.country].filter(Boolean).join(', ');

function formatCoordinate(value: number, axis: 'lat' | 'lon', t: (key: string) => string): string {
  const degrees = Math.floor(Math.abs(value));
  const minutes = Math.round((Math.abs(value) - degrees) * 60);
  const direction =
    axis === 'lat' ? (value >= 0 ? t('north') : t('south')) : value >= 0 ? t('east') : t('west');
  return `${degrees}°${String(minutes).padStart(2, '0')}′ ${direction}`;
}
