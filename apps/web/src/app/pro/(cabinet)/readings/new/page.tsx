import Link from 'next/link';
import { type OrderClient, OrderForm } from '@/components/pro/OrderForm';
import { birthLine, initial, type ProClient } from '@/lib/pro/birth';
import { cabinetGet, currentSeller } from '@/lib/pro/current';

export const metadata = { title: 'Новый отчёт' };

/** Ordering a reading: whom it is about, which product, and what it costs. */
export default async function NewReading({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const [{ client }, seller, found] = await Promise.all([
    searchParams,
    currentSeller(),
    cabinetGet<{ clients?: ProClient[] }>('/v1/pro/clients'),
  ]);
  if (found.status !== 200) throw new Error(`clients → ${found.status}`);
  const clients: OrderClient[] = (found.data?.clients ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    initial: initial(c.name),
    line: birthLine(c),
  }));
  const chosen = clients.some((c) => c.id === client) ? client : undefined;

  return (
    <>
      <div className="row">
        <Link href={chosen ? `/clients/${chosen}` : '/'} className="back" aria-label="Назад">
          ‹
        </Link>
        <h1 className="grow">Новый отчёт</h1>
      </div>
      {clients.length > 0 ? (
        <OrderForm clients={clients} balance={seller.balance} initialClient={chosen} />
      ) : (
        <div className="card">
          <p className="muted">Чтобы заказать разбор, сначала добавьте клиента.</p>
          <Link href="/clients/new" className="btn ghost small start">
            Добавить клиента
          </Link>
        </div>
      )}
    </>
  );
}
