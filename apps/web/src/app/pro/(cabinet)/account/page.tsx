import { CloseCabinet } from '@/components/pro/CloseCabinet';
import { creditsLabel } from '@/lib/pro/credits';
import { currentSeller } from '@/lib/pro/current';

export const metadata = { title: 'Аккаунт' };

/** The seller's own account, opened from their name in the bar: who is signed in, the balance,
 * and closing the cabinet. */
export default async function Account() {
  const seller = await currentSeller();
  const name = seller.name?.trim();
  return (
    <>
      <h1>Аккаунт</h1>
      <dl className="card facts">
        {name ? (
          <>
            <dt>Имя</dt>
            <dd>{name}</dd>
          </>
        ) : null}
        <dt>Почта</dt>
        <dd className="wrap">{seller.email}</dd>
        <dt>Баланс</dt>
        <dd>{creditsLabel(seller.balance)}</dd>
      </dl>
      <CloseCabinet email={seller.email} />
    </>
  );
}
