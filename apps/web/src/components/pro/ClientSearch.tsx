'use client';

import Link from 'next/link';
import { useState } from 'react';

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
  const [query, setQuery] = useState('');
  const needle = query.trim().toLocaleLowerCase('ru');
  const shown = needle
    ? clients.filter((client) => client.name.toLocaleLowerCase('ru').includes(needle))
    : clients;

  return (
    <>
      <input
        type="search"
        className="input"
        placeholder="Найти по имени"
        aria-label="Найти клиента"
        autoComplete="off"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {shown.length > 0 ? (
        <ul className="list" aria-label="Клиенты">
          {shown.map((client) => (
            <li key={client.id}>
              <Link href={`/clients/${client.id}`} className="item link">
                <span className="av" aria-hidden="true">
                  {client.initial}
                </span>
                <span className="grow">
                  <span className="t">{client.name}</span>
                  <span className="s num">{client.line}</span>
                  <span className="s">отчётов: {client.readings}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted" role="status">
          Никого с таким именем.
        </p>
      )}
    </>
  );
}
