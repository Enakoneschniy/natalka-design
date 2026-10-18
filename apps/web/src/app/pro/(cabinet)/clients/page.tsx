import Link from 'next/link';
import { type ClientRow, ClientSearch } from '@/components/pro/ClientSearch';
import { birthLine, initial, type ProClient } from '@/lib/pro/birth';
import { cabinetGet } from '@/lib/pro/current';
import { proLang, titleOf } from '@/lib/pro/locale';
import type { ReadingSummary } from '@/lib/pro/readings';
import { textFor } from '@/lib/pro/text';

export const generateMetadata = titleOf('clients');

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
  const [clients, readings, lang] = await Promise.all([
    cabinetGet<{ clients?: ProClient[] }>('/v1/pro/clients'),
    cabinetGet<{ readings?: ReadingSummary[] }>('/v1/pro/readings'),
    proLang(),
  ]);
  const t = textFor(lang).clients;
  if (clients.status !== 200) throw new Error(`clients → ${clients.status}`);
  const counts = readingCounts(readings.status === 200 ? (readings.data?.readings ?? []) : []);
  const rows: ClientRow[] = (clients.data?.clients ?? []).map((client) => ({
    id: client.id,
    name: client.name,
    initial: initial(client.name),
    line: birthLine(client, lang),
    readings: counts.get(client.id) ?? 0,
  }));

  return (
    <>
      <div className="row">
        <h1 className="grow">{t.title}</h1>
        <Link href="/clients/new" className="btn small">
          {t.add}
        </Link>
      </div>
      {rows.length > 0 ? (
        <ClientSearch clients={rows} />
      ) : (
        <div className="card">
          <p className="muted">{t.empty}</p>
          <Link href="/clients/new" className="btn ghost small start">
            {textFor(lang).common.addClient}
          </Link>
        </div>
      )}
      <p className="muted">{t.privacy}</p>
    </>
  );
}
