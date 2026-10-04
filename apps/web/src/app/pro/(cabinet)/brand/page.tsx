import { BrandForm } from '@/components/pro/BrandForm';
import { coverDate, draftFromBrand, type SavedBrand, type Tone } from '@/lib/pro/brand';
import { cabinetGet } from '@/lib/pro/current';

export const metadata = { title: 'Бренд' };

/** The seller's brand: fetched here once, then edited (and previewed) by the client form. */
export default async function Brand() {
  const found = await cabinetGet<{ brand?: SavedBrand | null; tone?: Tone }>('/v1/pro/brand');
  if (found.status !== 200) throw new Error(`brand → ${found.status}`);
  const brand = found.data?.brand ?? null;
  const tone: Tone = found.data?.tone === 'ty' ? 'ty' : 'vy';

  return (
    <>
      <h1>Бренд</h1>
      <p className="muted">
        Так ваши разборы будут выглядеть для клиентов: обложка, вступление и подпись.
      </p>
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
