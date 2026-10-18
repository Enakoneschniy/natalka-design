import { BuyPack } from '@/components/pro/BuyPack';
import { InviteForm } from '@/components/pro/InviteForm';
import { PurchaseStatus } from '@/components/pro/PurchaseStatus';
import { creditsNoun } from '@/lib/pro/credits';
import { cabinetGet, currentSeller } from '@/lib/pro/current';
import { proLang, titleOf } from '@/lib/pro/locale';
import {
  type Purchase,
  purchaseId,
  purchaseLine,
  purchasePill,
  refundLine,
  signupInviteNotice,
} from '@/lib/pro/purchases';
import { readingDate } from '@/lib/pro/readings';
import { textFor } from '@/lib/pro/text';

export const generateMetadata = titleOf('credits');

/** The Кредиты tab: the balance, the packs, the purchase history and, until one is used, the
 * invite-code field. Back from Stripe with `?purchase=<id>`, it watches that purchase land; from a
 * sign-up whose code did not apply (`?invite=`), it says so above the balance. */
export default async function Credits({
  searchParams,
}: {
  searchParams: Promise<{ purchase?: string | string[]; invite?: string | string[] }>;
}) {
  const [seller, history, params, lang] = await Promise.all([
    currentSeller(),
    cabinetGet<{ purchases?: Purchase[] }>('/v1/pro/purchases'),
    searchParams,
    proLang(),
  ]);
  const t = textFor(lang).purchases;
  // The history is a nice-to-have on this page: without it the balance and the packs still work.
  const purchases = history.status === 200 ? (history.data?.purchases ?? []) : null;
  const returning = purchaseId(params.purchase);
  const inviteNotice = signupInviteNotice(params.invite, seller.invite_redeemed, lang);
  const now = new Date();

  return (
    <>
      <h1>{t.title}</h1>
      {returning ? (
        <PurchaseStatus
          key={returning}
          id={returning}
          initial={purchases?.find((p) => p.id === returning)?.status}
        />
      ) : null}
      {inviteNotice ? (
        <div className="card notice bad" role="alert">
          <strong>{inviteNotice.title}</strong>
          <span className="muted">{inviteNotice.text}</span>
        </div>
      ) : null}
      <div className="card balance-card">
        <span className="muted">{t.onBalance}</span>
        <p className="balance">
          <span className="big num">{seller.balance}</span>
          <span className="muted">{creditsNoun(seller.balance, lang)}</span>
        </p>
        <span className="muted">{t.rate}</span>
      </div>
      <BuyPack />
      <InviteForm redeemed={seller.invite_redeemed} />
      <h3>{t.history}</h3>
      {purchases === null ? (
        <p className="muted">{t.historyDown}</p>
      ) : purchases.length === 0 ? (
        <p className="muted">{t.none}</p>
      ) : (
        <ul className="list" aria-label={t.historyLabel}>
          {purchases.map((p) => {
            const pill = purchasePill(p.status, lang);
            const refund = refundLine(p, lang);
            return (
              <li key={p.id} className="item">
                <div className="grow">
                  <div className="t">{purchaseLine(p, lang)}</div>
                  <div className="meta">
                    <span className={`pill ${pill.tone}`}>{pill.label}</span>
                    <span className="s">
                      {readingDate(p.paid_at ?? p.created_at, lang, now)}
                      {refund ? ` · ${refund}` : ''}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="muted">{t.stripe}</p>
    </>
  );
}
