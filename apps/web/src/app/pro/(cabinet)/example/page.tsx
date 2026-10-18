import Link from 'next/link';
import { SectionText } from '@/components/pro/SectionText';
import { cabinetGet } from '@/lib/pro/current';
import type { ProLang } from '@/lib/pro/lang';
import { proLang, titleOf } from '@/lib/pro/locale';
import { type Product, productLabel, type ReadingSection, roman } from '@/lib/pro/readings';
import { textFor } from '@/lib/pro/text';

export const generateMetadata = titleOf('example');

/** A finished reading to look at before ordering one: its sections, to read, nothing to press.
 * In the cabinet's language when there is a sample in it; else the Russian one, saying so. */
export default async function Example() {
  const lang = await proLang();
  const t = textFor(lang);
  const demo = await cabinetGet<{
    product?: Product;
    lang?: ProLang;
    sections?: ReadingSection[];
  }>(`/v1/pro/demo?lang=${lang}`);
  const sections = demo.status === 200 ? (demo.data?.sections ?? []) : [];
  if (demo.status !== 200 && demo.status !== 404) throw new Error(`demo → ${demo.status}`);
  const product = demo.data?.product;
  const written = demo.data?.lang ?? 'ru';

  return (
    <>
      <div className="row">
        <Link href="/" className="back" aria-label={t.common.backToReports}>
          ‹
        </Link>
        <div className="grow">
          <h1>{t.example.title}</h1>
          {product ? <p className="muted">{productLabel(product, lang)}</p> : null}
        </div>
      </div>
      {sections.length > 0 ? (
        <>
          <p className="card notice">
            <strong>{t.example.notice}</strong>
            {written !== lang ? <span className="muted">{t.example.otherLanguage}</span> : null}
          </p>
          <ol className="sections" aria-label={t.example.sections} lang={written}>
            {sections.map((section, index) => (
              <li key={section.id} className="sec">
                <div className="h">
                  <span className="n" aria-hidden="true">
                    {roman(index + 1)}
                  </span>
                  <h2>{section.title}</h2>
                </div>
                <SectionText text={section.text} />
              </li>
            ))}
          </ol>
        </>
      ) : (
        <div className="card">
          <p className="muted">{t.example.soon}</p>
        </div>
      )}
    </>
  );
}
