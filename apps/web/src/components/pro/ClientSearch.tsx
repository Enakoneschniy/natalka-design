'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useLang, useText } from './Lang';

export interface ClientRow {
  id: string;
  name: string;
  initial: string;
  line: string;
  readings: number;
}

/** The client list with its search box. Names are encrypted on the server, so the filtering
 * happens here, over the rows the page already rendered. */
export function ClientSearch({ clients }: { clients: ClientRow[] }) {
  const lang = useLang();
  const t = useText();
  const [query, setQuery] = useState('');
  const needle = query.trim().toLocaleLowerCase(lang);
  const shown = needle
    ? clients.filter((client) => client.name.toLocaleLowerCase(lang).includes(needle))
    : clients;

  return (
    <>
      <input
        type="search"
        className="input"
        placeholder={t.clients.search}
        aria-label={t.clients.searchLabel}
        autoComplete="off"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {shown.length > 0 ? (
        <ul className="list" aria-label={t.clients.title}>
          {shown.map((client) => (
            <li key={client.id}>
              <Link href={`/clients/${client.id}`} className="item link">
                <span className="av" aria-hidden="true">
                  {client.initial}
                </span>
                <span className="grow">
                  <span className="t">{client.name}</span>
                  <span className="s num">{client.line}</span>
                  <span className="s">{t.clients.readings(client.readings)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted" role="status">
          {t.clients.nobody}
        </p>
      )}
    </>
  );
}
