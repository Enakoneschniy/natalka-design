import { CloseCabinet } from '@/components/pro/CloseCabinet';
import { LangSwitch } from '@/components/pro/Lang';
import { creditsLabel } from '@/lib/pro/credits';
import { currentSeller } from '@/lib/pro/current';
import { proLang, titleOf } from '@/lib/pro/locale';
import { textFor } from '@/lib/pro/text';

export const generateMetadata = titleOf('account');

/** The seller's own account, opened from their name in the bar: who is signed in, the balance,
 * the cabinet's language, and closing the cabinet. */
export default async function Account() {
  const [seller, lang] = await Promise.all([currentSeller(), proLang()]);
  const t = textFor(lang).account;
  const name = seller.name?.trim();
  return (
    <>
      <h1>{t.title}</h1>
      <dl className="card facts">
        {name ? (
          <>
            <dt>{t.name}</dt>
            <dd>{name}</dd>
          </>
        ) : null}
        <dt>{t.email}</dt>
        <dd className="wrap">{seller.email}</dd>
        <dt>{t.balance}</dt>
        <dd>{creditsLabel(seller.balance, lang)}</dd>
      </dl>
      <section className="field" aria-labelledby="account-language">
        <h2 id="account-language">{t.language}</h2>
        <LangSwitch full />
        <p className="muted">{t.languageHint}</p>
      </section>
      <CloseCabinet email={seller.email} />
    </>
  );
}
