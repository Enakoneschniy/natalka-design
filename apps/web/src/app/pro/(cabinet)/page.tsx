import Link from 'next/link';
import { type ReadingDetail, ReadingItem } from '@/components/pro/ReadingItem';
import type { ProClient } from '@/lib/pro/birth';
import { cabinetGet } from '@/lib/pro/current';
import type { ReadingSummary, ReadingView } from '@/lib/pro/readings';

export const metadata = { title: 'Отчёты' };

/** How many readings being written get their progress looked up; more than this is rare. */
const PROGRESS_LOOKUPS = 5;

/** The home tab: every reading, newest first, with a sample to look at before ordering. */
export default async function Reports() {
  const [list, clients, demo] = await Promise.all([
    cabinetGet<{ readings?: ReadingSummary[] }>('/v1/pro/readings'),
    cabinetGet<{ clients?: ProClient[] }>('/v1/pro/clients'),
    cabinetGet<{ sections?: unknown[] }>('/v1/pro/demo'),
  ]);
  if (list.status !== 200) throw new Error(`readings → ${list.status}`);
  const readings = list.data?.readings ?? [];
  const names = new Map((clients.data?.clients ?? []).map((c) => [c.id, c.name]));

  // The list does not carry progress; the few readings still being written are asked one by one.
  const writing = readings.filter((r) => r.status === 'writing').slice(0, PROGRESS_LOOKUPS);
  const progress = new Map<string, ReadingDetail>(
    await Promise.all(
      writing.map(async (r): Promise<[string, ReadingDetail]> => {
        const found = await cabinetGet<ReadingView>(`/v1/pro/readings/${r.id}`);
        return found.status === 200 && found.data
          ? [r.id, { written: found.data.written, total: found.data.total }]
          : [r.id, {}];
      }),
    ),
  );
  const hasDemo = demo.status === 200 && (demo.data?.sections?.length ?? 0) > 0;

  return (
    <>
      <div className="row">
        <h1 className="grow">Отчёты</h1>
        <Link href="/readings/new" className="btn small">
          + Новый
        </Link>
      </div>
      {readings.length > 0 ? (
        <ul className="list" aria-label="Отчёты">
          {readings.map((reading) => (
            <li key={reading.id}>
              <ReadingItem
                reading={{ ...reading, ...progress.get(reading.id) }}
                client={names.get(reading.client_id)}
                partner={
                  reading.partner_client_id ? names.get(reading.partner_client_id) : undefined
                }
              />
            </li>
          ))}
        </ul>
      ) : (
        <div className="card">
          <p className="muted">Здесь будут ваши разборы. Начните с клиента.</p>
          <Link href="/clients" className="btn ghost small start">
            К клиентам
          </Link>
        </div>
      )}
      {hasDemo ? (
        <div className="card">
          <h3>Пример готового разбора</h3>
          <p className="muted">Посмотрите, как выглядит отчёт, прежде чем заказывать свой.</p>
          <Link href="/example" className="btn ghost small start">
            Открыть пример
          </Link>
        </div>
      ) : (
        <div className="card disabled" aria-disabled="true">
          <h3>Пример готового разбора</h3>
          <p className="muted">Пример появится скоро.</p>
        </div>
      )}
    </>
  );
}
