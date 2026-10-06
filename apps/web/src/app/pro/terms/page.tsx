import Link from 'next/link';
import { renderLegal } from '@/content/legal';
import { proOffer } from '@/content/legal/pro-offer';

export const metadata = { title: 'Оферта' };

/** Public: the sign-up form links here. The offer every seller accepts when opening a cabinet. */
export default function Terms() {
  return (
    <main className="screen plain">
      <header className="bar flush">
        <Link href="/" className="logo">
          Chronika<small>PRO</small>
        </Link>
      </header>
      {/* Our own text from the repository, rendered by our own converter that escapes everything
          first — the only HTML here is what renderLegal produces. */}
      <article
        className="legal"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted, escaped, from the repo
        dangerouslySetInnerHTML={{ __html: renderLegal(proOffer, 'ru') }}
      />
    </main>
  );
}
