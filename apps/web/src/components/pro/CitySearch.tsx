/* The WAI-ARIA combobox pattern: the input keeps focus and owns a listbox of options, which is
   what these rules discourage on a ul/li. A <select> cannot search as you type.
   biome-ignore-all lint/a11y/noNoninteractiveElementToInteractiveRole: combobox pattern
   biome-ignore-all lint/a11y/useFocusableInteractive: focus stays in the input
   biome-ignore-all lint/a11y/useSemanticElements: a <select> cannot search as you type */
'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { City } from '@/app/api/cities/route';
import { cityLabel } from '@/lib/birth-input';
import { coordinatesLine } from '@/lib/pro/birth';

/** The birth city, from the site's own city search: picking one gives the coordinates and the
 * time zone. Typing again clears the pick, so a half-edited name never passes as a city. */
export function CitySearch({
  id,
  value,
  onChange,
  error,
  describedBy,
}: {
  id: string;
  value: City | null;
  onChange: (city: City | null) => void;
  error?: string;
  describedBy?: string;
}) {
  const listId = useId();
  const box = useRef<HTMLDivElement>(null);
  const [text, setText] = useState(value ? cityLabel(value) : '');
  const [options, setOptions] = useState<City[]>([]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // One request per pause in typing; the previous one is aborted, so an old answer never lands
  // over a newer one.
  const query = text.trim();
  const picked = value ? cityLabel(value) : null;
  useEffect(() => {
    if (query.length < 2 || query === picked) {
      setOptions([]);
      setOpen(false);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/cities?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        const data = (await response.json()) as { cities?: City[] };
        const found = data.cities ?? [];
        setOptions(found);
        setActive(0);
        setOpen(found.length > 0);
      } catch {
        /* aborted or offline: the field stays usable and the form says a city is needed */
      }
    }, 150);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, picked]);

  const choose = (city: City) => {
    setText(cityLabel(city));
    setOpen(false);
    onChange(city);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (options.length === 0) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + step + options.length) % options.length);
    } else if (event.key === 'Enter' && open) {
      const option = options[active];
      if (option) {
        event.preventDefault();
        choose(option);
      }
    }
  };

  const optionId = (index: number) => `${listId}-${index}`;

  return (
    <div className="combo" ref={box}>
      <input
        id={id}
        className="input"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          if (value) onChange(null);
        }}
        onKeyDown={onKeyDown}
        onFocus={() => options.length > 0 && setOpen(true)}
        placeholder="Начните вводить название"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && options[active] ? optionId(active) : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      {open && options.length > 0 ? (
        <ul className="options" id={listId} role="listbox" aria-label="Города">
          {options.map((city, index) => (
            <li
              key={city.id}
              id={optionId(index)}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => {
                event.preventDefault();
                choose(city);
              }}
              onMouseEnter={() => setActive(index)}
            >
              <span>{city.name}</span>
              <span className="muted">
                {[city.region, city.country].filter(Boolean).join(' · ')}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {value ? <span className="muted num coords">{coordinatesLine(value)}</span> : null}
    </div>
  );
}
