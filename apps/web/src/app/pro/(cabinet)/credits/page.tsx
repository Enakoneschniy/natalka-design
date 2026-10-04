import { creditsNoun } from '@/lib/pro/credits';
import { currentSeller } from '@/lib/pro/current';

export const metadata = { title: 'Кредиты' };

export default async function Credits() {
  const seller = await currentSeller();
  return (
    <>
      <h1>Кредиты</h1>
      <div className="card">
        <h3>Баланс</h3>
        <p className="balance">
          <span className="big num">{seller.balance}</span>
          <span className="muted">{creditsNoun(seller.balance)}</span>
        </p>
      </div>
      <div className="card">
        <p className="muted">Этот раздел появится в следующем обновлении кабинета.</p>
      </div>
    </>
  );
}
