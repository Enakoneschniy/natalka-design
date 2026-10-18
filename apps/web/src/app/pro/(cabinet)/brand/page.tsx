import { BrandForm } from '@/components/pro/BrandForm';
import { coverDate, draftFromBrand, type SavedBrand, type Tone } from '@/lib/pro/brand';
import { cabinetGet } from '@/lib/pro/current';
import { proText, titleOf } from '@/lib/pro/locale';

export const generateMetadata = titleOf('brand');

/** The seller's brand: fetched here once, then edited (and previewed) by the client form. */
export default async function Brand() {
  const [found, t] = await Promise.all([
    cabinetGet<{ brand?: SavedBrand | null; tone?: Tone }>('/v1/pro/brand'),
    proText(),
  ]);
  if (found.status !== 200) throw new Error(`brand → ${found.status}`);
  const brand = found.data?.brand ?? null;
  const tone: Tone = found.data?.tone === 'ty' ? 'ty' : 'vy';

  return (
    <>
      <h1>{t.brand.title}</h1>
      <p className="muted">{t.brand.lead}</p>
      <BrandForm
        initial={draftFromBrand(brand, tone)}
        saved={brand !== null}
        logo={brand?.has_logo ?? false}
        photo={brand?.has_photo ?? false}
        date={coverDate(new Date())}
      />
    </>
  );
}
