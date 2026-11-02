import { useLocale, useTranslations } from 'next-intl';
import { OFFER, offerLastDay } from '@/lib/pricing';

/** "−50% до 7 ноября": the offer's terms, as the advert states them. The long form names what
 * the discount is on, for a screen where the button next to it says "free". */
export function OfferTag({ long = false }: { long?: boolean }) {
  const t = useTranslations('offer');
  const locale = useLocale();
  return (
    <span className="offer-tag">
      {t(long ? 'hero' : 'tag', { percent: OFFER.percent, until: offerLastDay(locale) })}
    </span>
  );
}

/** A price and, while the offer runs, the full one struck through before it. A screen reader
 * does not announce a strike-through, so it is told in words which of the two figures is not
 * the price. */
export function OfferPrice({
  price,
  full,
  tag = true,
}: {
  price: string;
  full: string | null;
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
      {full && tag ? <OfferTag /> : null}
    </span>
  );
}
