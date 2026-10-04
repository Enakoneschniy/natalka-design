import { notFound } from 'next/navigation';
import { Reading } from '@/components/pro/Reading';
import type { ProClient } from '@/lib/pro/birth';
import { cabinetGet } from '@/lib/pro/current';
import { type ReadingView, readingTitle } from '@/lib/pro/readings';

export const metadata = { title: 'Отчёт' };

/** One reading: fetched here once, then kept current by the client component. */
export default async function ReadingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[A-Za-z0-9-]+$/.test(id)) notFound();

  const [found, clients] = await Promise.all([
    cabinetGet<ReadingView>(`/v1/pro/readings/${id}`),
    cabinetGet<{ clients?: ProClient[] }>('/v1/pro/clients'),
  ]);
  if (found.status === 404) notFound();
  if (found.status !== 200 || !found.data?.id) throw new Error(`reading → ${found.status}`);
  const view = found.data;
  const names = new Map((clients.data?.clients ?? []).map((c) => [c.id, c.name]));
  const title = readingTitle(
    view.product,
    names.get(view.client_id),
    view.partner_client_id ? names.get(view.partner_client_id) : undefined,
  );

  return <Reading initial={view} title={title} />;
}
