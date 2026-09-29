import { headers } from 'next/headers';
import { setRequestLocale } from 'next-intl/server';
import { ANGLES, type Angle, Landing } from '@/components/Landing';
import type { Locale } from '@/i18n/routing';
import type { ChartFacts } from '@/lib/chart';
import demo from '@/lib/demo-chart.json';

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
  const asked = (await searchParams).h;
  const angle = (Array.isArray(asked) ? asked[0] : asked) ?? '';
  // The country header is read so the page is rendered per-region, the way the rest of the site is.
  await headers();
  return (
    <Landing
      locale={locale as Locale}
      facts={facts}
      angle={(ANGLES as readonly string[]).includes(angle) ? (angle as Angle) : 'dates'}
    />
  );
}
