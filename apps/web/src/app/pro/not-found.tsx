import Link from 'next/link';
import { proText, titleOf } from '@/lib/pro/locale';

export const generateMetadata = titleOf('notFound');

/** The cabinet's 404, in its own root layout: an address on the cabinet host that has no page. */
export default async function ProNotFound() {
  const t = await proText();
  return (
    <main className="screen plain auth">
      <div className="intro">
        <span className="eyebrow">Chronika Pro</span>
        <h1>{t.notFound.title}</h1>
      </div>
      <Link href="/" className="btn ghost start">
        {t.notFound.home}
      </Link>
    </main>
  );
}
