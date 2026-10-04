import Link from 'next/link';
import { type ClientRow, ClientSearch } from '@/components/pro/ClientSearch';
import { birthLine, initial, type ProClient } from '@/lib/pro/birth';
import { cabinetGet } from '@/lib/pro/current';
import type { ReadingSummary } from '@/lib/pro/readings';

export const metadata = { title: 'Клиенты' };

/** How many readings each client is in, as the client or as the partner. */
function readingCounts(readings: ReadingSummary[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const reading of readings) {
    for (const id of new Set([reading.client_id, reading.partner_client_id])) {
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
}

export default async function Clients() {
  const [clients, readings] = await Promise.all([
    cabinetGet<{ clients?: ProClient[] }>('/v1/pro/clients'),
    cabinetGet<{ readings?: ReadingSummary[] }>('/v1/pro/readings'),
  ]);
  if (clients.status !== 200) throw new Error(`clients → ${clients.status}`);
  const counts = readingCounts(readings.status === 200 ? (readings.data?.readings ?? []) : []);
  const rows: ClientRow[] = (clients.data?.clients ?? []).map((client) => ({
    id: client.id,
    name: client.name,
    initial: initial(client.name),
    line: birthLine(client),
    readings: counts.get(client.id) ?? 0,
  }));

  return (
    <>
      <div className="row">
        <h1 className="grow">Клиенты</h1>
        <Link href="/clients/new" className="btn small">
          + Клиент
        </Link>
      </div>
      {rows.length > 0 ? (
        <ClientSearch clients={rows} />
      ) : (
        <div className="card">
          <p className="muted">Пока нет клиентов. Добавьте первого — это займёт минуту.</p>
          <Link href="/clients/new" className="btn ghost small start">
            Добавить клиента
          </Link>
        </div>
      )}
      <p className="muted">Данные рождения хранятся зашифрованными и видны только вам.</p>
    </>
  );
}
