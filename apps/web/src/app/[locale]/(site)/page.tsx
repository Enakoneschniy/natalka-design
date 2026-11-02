import { cookies, headers } from 'next/headers';
import { setRequestLocale } from 'next-intl/server';
import { ANGLES, type Angle, Landing } from '@/components/Landing';
import { Marketing } from '@/components/Marketing';
import { StructuredData } from '@/components/StructuredData';
import type { Locale } from '@/i18n/routing';
import type { ChartFacts } from '@/lib/chart';
import demo from '@/lib/demo-chart.json';
import { bundlePrice } from '@/lib/pricing';
import { activePromo, PROMO_COOKIE } from '@/lib/promo';
import { count } from '@/lib/stats';

const facts = demo as unknown as ChartFacts;

/** One product, one page. The headline follows `?h=` so that the sentence a visitor saw in the
 * advert is the sentence at the top of the page; anything unknown falls back to the default. */
export default async function LandingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const search = await searchParams;
  const asked = search.h;
  const angle = (Array.isArray(asked) ? asked[0] : asked) ?? '';
  // The price is the visitor's own, in their currency, and the same figure the paywall will show.
  // A code in the link counts on this very visit: the cookie the middleware sets for it only
  // arrives with the next request.
  const linked = Array.isArray(search.code) ? search.code[0] : search.code;
  const promo = activePromo(linked) ?? activePromo((await cookies()).get(PROMO_COOKIE)?.value);
  const price = bundlePrice((await headers()).get('cf-ipcountry'), new Date(), promo);
  const chosen = (ANGLES as readonly string[]).includes(angle) ? (angle as Angle) : 'dates';
  await count('landing', { angle: chosen });
  return (
    <>
      <StructuredData locale={locale} price={price} />
      <Landing locale={locale as Locale} facts={facts} angle={chosen} price={price} />
      <Marketing />
    </>
  );
}
