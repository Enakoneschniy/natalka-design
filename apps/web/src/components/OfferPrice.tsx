import { useLocale, useTranslations } from 'next-intl';
import { type Discount, lastDay } from '@/lib/pricing';

/** "−50% до 7 ноября", or "Промокод X: −30% до 24 декабря": the discount's terms, as the advert
 * or the code states them. The long form names what the discount is on, for a screen where the
 * button next to it says "free". */
export function OfferTag({ discount, long = false }: { discount: Discount; long?: boolean }) {
  const t = useTranslations('offer');
  const locale = useLocale();
  const values = {
    percent: discount.percent,
    until: lastDay(discount.ends, locale),
    code: discount.code ?? '',
  };
  const key = discount.code ? (long ? 'promoHero' : 'promo') : long ? 'hero' : 'tag';
  return <span className="offer-tag">{t(key, values)}</span>;
}

/** A price and, while a discount applies, the full one struck through before it. A screen reader
 * does not announce a strike-through, so it is told in words which of the two figures is not
 * the price. */
export function OfferPrice({
  price,
  full,
  discount,
  tag = true,
}: {
  price: string;
  full: string | null;
  discount: Discount | null;
  /** Off where the terms are already printed nearby. */
  tag?: boolean;
}) {
  const t = useTranslations('offer');
  return (
    <span className="offer-price">
      {full ? (
        <s className="offer-was">
          <span className="visually-hidden">{t('was')} </span>
          {full}
        </s>
      ) : null}
      <span className="offer-now">{price}</span>
      {full && discount && tag ? <OfferTag discount={discount} /> : null}
    </span>
  );
}
