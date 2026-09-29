import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isDraft, LEGAL, type LegalDoc, legalTitle, renderLegal } from '@/content/legal';

const isDoc = (value: string): value is LegalDoc => value in LEGAL;

/** The document in the visitor's language, or in English when a language has no translation. */
function source(doc: LegalDoc, locale: string): string {
  return LEGAL[doc][locale] ?? LEGAL[doc].en ?? '';
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; doc: string }>;
}): Promise<Metadata> {
  const { locale, doc } = await params;
  if (!isDoc(doc)) return {};
  return { title: `${legalTitle(source(doc, locale))} — Chronika` };
}

export default async function LegalPage({
  params,
}: {
  params: Promise<{ locale: string; doc: string }>;
}) {
  const { locale, doc } = await params;
  setRequestLocale(locale);
  if (!isDoc(doc)) notFound();
  const t = await getTranslations({ locale, namespace: 'legal' });
  const text = source(doc, locale);

  return (
    <div className="flow">
      <div className="container-page narrow">
        {isDraft(text) ? <p className="explain legal-draft">{t('draft')}</p> : null}
        {/* Our own text from the repository, rendered by our own four-rule converter that escapes
            everything first — the only HTML here is what renderLegal produces. */}
        <article
          className="legal"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted, escaped, from the repo
          dangerouslySetInnerHTML={{ __html: renderLegal(text, locale) }}
        />
      </div>
    </div>
  );
}
