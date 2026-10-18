import Link from 'next/link';
import { LangSwitch } from '@/components/pro/Lang';
import { renderLegal } from '@/content/legal';
import { proOffer } from '@/content/legal/pro-offer';
import { proOfferUk } from '@/content/legal/pro-offer-uk';
import { proLang, titleOf } from '@/lib/pro/locale';

export const generateMetadata = titleOf('terms');

/** Public: the sign-up form links here. The offer every seller accepts when opening a cabinet, in
 * the visitor's language; the Ukrainian text is a translation that names the Russian one as the
 * one that prevails. */
export default async function Terms() {
  const lang = await proLang();
  return (
    <main className="screen plain">
      <header className="bar flush">
        <Link href="/" className="logo">
          Chronika<small>PRO</small>
        </Link>
        <span className="grow" />
        <LangSwitch />
      </header>
      {/* Our own text from the repository, rendered by our own converter that escapes everything
          first — the only HTML here is what renderLegal produces. */}
      <article
        className="legal"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted, escaped, from the repo
        dangerouslySetInnerHTML={{
          __html: renderLegal(lang === 'uk' ? proOfferUk : proOffer, lang),
        }}
      />
    </main>
  );
}
