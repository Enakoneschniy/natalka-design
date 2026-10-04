import Link from 'next/link';
import { SectionText } from '@/components/pro/SectionText';
import { cabinetGet } from '@/lib/pro/current';
import { PRODUCT_LABEL, type Product, type ReadingSection, roman } from '@/lib/pro/readings';

export const metadata = { title: 'Пример разбора' };

/** A finished reading to look at before ordering one: its sections, to read, nothing to press. */
export default async function Example() {
  const demo = await cabinetGet<{ product?: Product; sections?: ReadingSection[] }>('/v1/pro/demo');
  const sections = demo.status === 200 ? (demo.data?.sections ?? []) : [];
  if (demo.status !== 200 && demo.status !== 404) throw new Error(`demo → ${demo.status}`);
  const product = demo.data?.product;

  return (
    <>
      <div className="row">
        <Link href="/" className="back" aria-label="Назад к отчётам">
          ‹
        </Link>
        <div className="grow">
          <h1>Пример разбора</h1>
          {product && PRODUCT_LABEL[product] ? (
            <p className="muted">{PRODUCT_LABEL[product]}</p>
          ) : null}
        </div>
      </div>
      {sections.length > 0 ? (
        <>
          <p className="card notice">
            <strong>Так выглядит готовый разбор. В вашем PDF будет ваш бренд.</strong>
          </p>
          <ol className="sections" aria-label="Разделы примера">
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
          <p className="muted">Пример появится скоро.</p>
        </div>
      )}
    </>
  );
}
