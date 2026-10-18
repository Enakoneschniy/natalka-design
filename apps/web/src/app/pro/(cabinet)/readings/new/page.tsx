import Link from 'next/link';
import { type OrderClient, OrderForm } from '@/components/pro/OrderForm';
import { birthLine, initial, type ProClient } from '@/lib/pro/birth';
import { cabinetGet, currentSeller } from '@/lib/pro/current';
import { proLang, titleOf } from '@/lib/pro/locale';
import { textFor } from '@/lib/pro/text';

export const generateMetadata = titleOf('newReading');

/** Ordering a reading: whom it is about, which product, and what it costs. */
export default async function NewReading({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const [{ client }, seller, found, lang] = await Promise.all([
    searchParams,
    currentSeller(),
    cabinetGet<{ clients?: ProClient[] }>('/v1/pro/clients'),
    proLang(),
  ]);
  const t = textFor(lang);
  if (found.status !== 200) throw new Error(`clients → ${found.status}`);
  const clients: OrderClient[] = (found.data?.clients ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    initial: initial(c.name),
    line: birthLine(c, lang),
  }));
  const chosen = clients.some((c) => c.id === client) ? client : undefined;

  return (
    <>
      <div className="row">
        <Link
          href={chosen ? `/clients/${chosen}` : '/'}
          className="back"
          aria-label={t.common.back}
        >
          ‹
        </Link>
        <h1 className="grow">{t.meta.newReading}</h1>
      </div>
      {clients.length > 0 ? (
        <OrderForm clients={clients} balance={seller.balance} initialClient={chosen} />
      ) : (
        <div className="card">
          <p className="muted">{t.order.noClients}</p>
          <Link href="/clients/new" className="btn ghost small start">
            {t.common.addClient}
          </Link>
        </div>
      )}
    </>
  );
}
