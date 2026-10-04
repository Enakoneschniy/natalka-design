import { BuyPack } from '@/components/pro/BuyPack';
import { InviteForm } from '@/components/pro/InviteForm';
import { PurchaseStatus } from '@/components/pro/PurchaseStatus';
import { creditsNoun } from '@/lib/pro/credits';
import { cabinetGet, currentSeller } from '@/lib/pro/current';
import {
  type Purchase,
  purchaseId,
  purchaseLine,
  purchasePill,
  refundLine,
} from '@/lib/pro/purchases';
import { readingDate } from '@/lib/pro/readings';

export const metadata = { title: 'Кредиты' };

/** The Кредиты tab: the balance, the packs, the purchase history and, until one is used, the
 * invite-code field. Back from Stripe with `?purchase=<id>`, it watches that purchase land. */
export default async function Credits({
  searchParams,
}: {
  searchParams: Promise<{ purchase?: string | string[] }>;
}) {
  const [seller, history, params] = await Promise.all([
    currentSeller(),
    cabinetGet<{ purchases?: Purchase[] }>('/v1/pro/purchases'),
    searchParams,
  ]);
  // The history is a nice-to-have on this page: without it the balance and the packs still work.
  const purchases = history.status === 200 ? (history.data?.purchases ?? []) : null;
  const returning = purchaseId(params.purchase);
  const now = new Date();

  return (
    <>
      <h1>Кредиты</h1>
      {returning ? (
        <PurchaseStatus
          key={returning}
          id={returning}
          initial={purchases?.find((p) => p.id === returning)?.status}
        />
      ) : null}
      <div className="card balance-card">
        <span className="muted">На балансе</span>
        <p className="balance">
          <span className="big num">{seller.balance}</span>
          <span className="muted">{creditsNoun(seller.balance)}</span>
        </p>
        <span className="muted">1 кредит = 1 отчёт · натал + прогноз = 2</span>
      </div>
      <BuyPack />
      <InviteForm redeemed={seller.invite_redeemed} />
      <h3>История</h3>
      {purchases === null ? (
        <p className="muted">История покупок сейчас недоступна, загляните позже.</p>
      ) : purchases.length === 0 ? (
        <p className="muted">Покупок пока нет.</p>
      ) : (
        <ul className="list" aria-label="История покупок">
          {purchases.map((p) => {
            const pill = purchasePill(p.status);
            const refund = refundLine(p);
            return (
              <li key={p.id} className="item">
                <div className="grow">
                  <div className="t">{purchaseLine(p)}</div>
                  <div className="meta">
                    <span className={`pill ${pill.tone}`}>{pill.label}</span>
                    <span className="s">
                      {readingDate(p.paid_at ?? p.created_at, now)}
                      {refund ? ` · ${refund}` : ''}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="muted">
        Оплата через Stripe. Кредиты не сгорают. Налоговый номер (VAT) можно указать на странице
        оплаты.
      </p>
    </>
  );
}
