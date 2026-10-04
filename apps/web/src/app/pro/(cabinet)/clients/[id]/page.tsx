import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DeleteClient } from '@/components/pro/DeleteClient';
import { ReadingItem } from '@/components/pro/ReadingItem';
import { coordinatesLine, displayDate, initial, type ProClient } from '@/lib/pro/birth';
import { cabinetGet } from '@/lib/pro/current';
import type { ReadingSummary } from '@/lib/pro/readings';

export const metadata = { title: 'Клиент' };

const GENDER_LABEL: Record<ProClient['gender'], string> = {
  f: 'женский',
  m: 'мужской',
  n: 'не указан',
};

/** One client: the birth details, the readings they are in, a new reading, and delete. */
export default async function ClientCard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[A-Za-z0-9-]+$/.test(id)) notFound();

  const [found, all] = await Promise.all([
    cabinetGet<{ client?: ProClient; readings?: ReadingSummary[] }>(`/v1/pro/clients/${id}`),
    cabinetGet<{ clients?: ProClient[] }>('/v1/pro/clients'),
  ]);
  if (found.status === 404) notFound();
  const client = found.data?.client;
  if (found.status !== 200 || !client) throw new Error(`client → ${found.status}`);
  const readings = found.data?.readings ?? [];
  // A synastry names its other person; they are one of the seller's clients too.
  const names = new Map((all.data?.clients ?? []).map((c) => [c.id, c.name]));
  names.set(client.id, client.name);

  return (
    <>
      <div className="row">
        <Link href="/clients" className="back" aria-label="Назад к клиентам">
          ‹
        </Link>
        <span className="av" aria-hidden="true">
          {initial(client.name)}
        </span>
        <h1 className="grow clip">{client.name}</h1>
      </div>
      <dl className="card facts">
        <dt>Дата рождения</dt>
        <dd className="num">{displayDate(client.date)}</dd>
        <dt>Время</dt>
        <dd className="num">{client.time ?? 'неизвестно'}</dd>
        <dt>Место</dt>
        <dd>
          {client.place}
          <span className="muted num">{coordinatesLine(client)}</span>
        </dd>
        <dt>Пол</dt>
        <dd>{GENDER_LABEL[client.gender] ?? GENDER_LABEL.n}</dd>
      </dl>
      <div className="row">
        <h2 className="grow">Отчёты</h2>
        <Link href={`/readings/new?client=${client.id}`} className="btn small">
          Новый отчёт
        </Link>
      </div>
      {readings.length > 0 ? (
        <ul className="list" aria-label="Отчёты клиента">
          {readings.map((reading) => (
            <li key={reading.id}>
              <ReadingItem
                reading={reading}
                client={names.get(reading.client_id)}
                partner={
                  reading.partner_client_id ? names.get(reading.partner_client_id) : undefined
                }
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Отчётов для этого клиента пока нет.</p>
      )}
      <DeleteClient id={client.id} />
    </>
  );
}
