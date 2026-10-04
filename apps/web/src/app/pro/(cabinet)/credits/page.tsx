import { creditsLabel } from '@/lib/pro/credits';
import { currentSeller } from '@/lib/pro/current';

export const metadata = { title: 'Кредиты' };

export default async function Credits() {
  const seller = await currentSeller();
  return (
    <>
      <h1>Кредиты</h1>
      <div className="card">
        <h3>Баланс</h3>
        <p className="big num">{seller.balance}</p>
        <p className="muted">{creditsLabel(seller.balance)} на счету</p>
      </div>
      <div className="card">
        <p className="muted">Этот раздел появится в следующем обновлении кабинета.</p>
      </div>
    </>
  );
}
