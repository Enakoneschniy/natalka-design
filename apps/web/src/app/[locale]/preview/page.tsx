import { headers } from 'next/headers';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AspectGrid, AspectLegend, ChartBadge, PositionsTable } from '@/components/ChartBits';
import { Paywall } from '@/components/Paywall';
import { Stepper } from '@/components/Stepper';
import { Wheel } from '@/components/Wheel';
import { type BirthInput, calcChart } from '@/lib/api';
import { type ChartFacts, MAJOR_ASPECTS } from '@/lib/chart';
import demo from '@/lib/demo-chart.json';
import { bundleFullPrice, priceFor } from '@/lib/pricing';

export const dynamic = 'force-dynamic';

type Search = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/** The form passes the birth data in the query string; there is no storage yet by design. */
function readInput(search: Search): { input: BirthInput; city: string; name?: string } | null {
  const date = one(search.d);
  const latitude = Number(one(search.lat));
  const longitude = Number(one(search.lon));
  const zone = one(search.tz);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!zone || Number.isNaN(latitude) || Number.isNaN(longitude)) return null;
  const time = one(search.t);
  return {
    input: {
      date,
      time: time && /^\d{2}:\d{2}$/.test(time) ? time : null,
      latitude,
      longitude,
      zone,
    },
    city: one(search.c) ?? '',
    ...(one(search.n) ? { name: one(search.n) } : {}),
  };
}

/** Matches src/lib/demo-chart.json, which is what the demo actually renders. */
const DEMO = {
  input: {
    date: '1994-05-15',
    time: '15:25',
    latitude: 45.1972,
    longitude: 33.3664,
    zone: 'Europe/Simferopol',
  },
  city: 'Yevpatoriya, Crimea, UA',
} as const;

export default async function PreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Search>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const search = await searchParams;
  const t = await getTranslations({ locale, namespace: 'preview' });
  const tp = await getTranslations({ locale, namespace: 'paywall' });

  // `?demo=1` shows the sample chart from the landing page without calling the engine.
  const isDemo = one(search.demo) === '1';
  const country = (await headers()).get('cf-ipcountry');
  const parsed: { input: BirthInput; city: string; name?: string } | null = isDemo
    ? { ...DEMO }
    : readInput(search);
  let facts: ChartFacts | null = isDemo ? (demo as unknown as ChartFacts) : null;
  if (parsed && !facts) {
    facts = await calcChart(parsed.input).catch(() => null);
  }

  if (!parsed || !facts) {
    return (
      <div className="flow">
        <div className="container-page narrow">
          <h1>{t('errorTitle')}</h1>
          <p className="lead flow-lead">{t('errorBody')}</p>
          <p>
            <Link className="btn btn-primary" href={`/${locale}/start`}>
              {t('back')}
            </Link>
          </p>
        </div>
      </div>
    );
  }

  const sun = facts.positions.find((p) => p.body === 'sun');
  const moon = facts.positions.find((p) => p.body === 'moon');
  // Only the five major aspects are drawn and listed, so only those are counted.
  const major = facts.aspects.filter((a) => MAJOR_ASPECTS.has(a.type));
  const harmonious = major.filter((a) => a.nature === 'harmonious').length;
  const tense = major.filter((a) => a.nature === 'tense').length;

  const natal = priceFor('natal', country);
  const forecast = priceFor('forecast', country);
  const bundle = priceFor('bundle', country);
  const bundleFull = bundleFullPrice(country);
  // The order screen needs the same birth data; carrying the query string keeps it stateless.
  const checkout = (product: string) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(search)) {
      const single = one(value);
      if (single) params.set(key, single);
    }
    params.set('p', product);
    return `/${locale}/checkout?${params.toString()}`;
  };

  // The three points every reading starts from; the Ascendant needs a known birth time.
  const core = [
    sun && { body: 'sun', longitude: sun.longitude, house: sun.house },
    moon && { body: 'moon', longitude: moon.longitude, house: moon.house },
    facts.houses && { body: 'asc', longitude: facts.houses.asc, house: 1 },
  ].filter((point): point is CorePointFacts => Boolean(point));

  return (
    <div className="flow">
      <div className="container-page">
        <div className="flow-head">
          <Stepper current="preview" />
          <Link className="small" href={`/${locale}/start`}>
            {t('edit')}
          </Link>
        </div>

        <div className="preview-head">
          <div>
            <h1>{parsed.name ? t('title', { name: parsed.name }) : t('titleAnonymous')}</h1>
            <p className="mono muted preview-meta">
              {[
                formatDate(facts.birth.date),
                facts.birth.unknown_time ? t('unknownTime') : facts.birth.time,
                parsed.city,
                `${facts.birth.zone} · ${facts.birth.utc_offset}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <Link className="btn btn-primary" href={checkout('natal')}>
            {tp('cta', { price: natal.formatted })}
          </Link>
        </div>

        <div className="preview-grid">
          <div className="preview-wheel">
            <div>
              <div className="wheel-glow">
                <Wheel facts={facts} size={520} detail="full" animate />
              </div>
              <div className="preview-badges">
                {sun ? <ChartBadge body="sun" longitude={sun.longitude} withDegree astro /> : null}
                {moon ? <ChartBadge body="moon" longitude={moon.longitude} withDegree /> : null}
                {facts.houses ? (
                  <ChartBadge body="asc" longitude={facts.houses.asc} withDegree />
                ) : null}
              </div>
              <p className="caption wheel-hint">{t('wheelHint')}</p>
            </div>
          </div>
          <div className="preview-side">
            <h2 className="block-title">{t('positionsTitle')}</h2>
            <div className="card">
              <PositionsTable facts={facts} />
            </div>
            {facts.houses ? null : <p className="explain">{t('noHouses')}</p>}
          </div>
        </div>

        <section className="preview-section">
          <div className="block-head">
            <h2 className="block-title">{t('aspectsTitle')}</h2>
            <p className="muted">{t('aspectsLead', { harmonious, tense })}</p>
          </div>
          <div className="aspect-block">
            <div className="card aspect-card">
              <AspectGrid facts={facts} />
            </div>
            <AspectLegend />
          </div>
        </section>

        <section className="preview-section">
          <div className="block-head">
            <h2 className="block-title">{t('coreTitle')}</h2>
            <p className="muted">{t('coreLead')}</p>
          </div>
          <div className="core-grid">
            {core.map((point) => (
              <CorePoint key={point.body} point={point} facts={facts} />
            ))}
          </div>
        </section>

        <Paywall
          checkoutHref={checkout('natal')}
          forecastHref={checkout('forecast')}
          bundleHref={checkout('bundle')}
          natal={natal.formatted}
          forecast={forecast.formatted}
          bundle={bundle.formatted}
          bundleFull={bundleFull.formatted}
        />
      </div>
    </div>
  );
}

interface CorePointFacts {
  body: string;
  longitude: number;
  house: number | null;
}

/** Sun, Moon and Ascendant with the aspects they actually make — facts only, no interpretation. */
function CorePoint({ point, facts }: { point: CorePointFacts; facts: ChartFacts }) {
  const t = useTranslations('chart');
  const links = facts.aspects
    .filter(
      (aspect) =>
        MAJOR_ASPECTS.has(aspect.type) && (aspect.a === point.body || aspect.b === point.body),
    )
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 4);

  return (
    <div className="card core-card">
      <ChartBadge
        body={point.body}
        longitude={point.longitude}
        withDegree
        astro={point.body === 'sun'}
      />
      {point.house ? (
        <p className="mono muted small">{t('houseShort', { n: point.house })}</p>
      ) : null}
      <ul className="core-aspects">
        {links.map((aspect) => {
          const other = aspect.a === point.body ? aspect.b : aspect.a;
          return (
            <li key={`${aspect.a}-${aspect.b}-${aspect.type}`}>
              <span className={`dot ${aspect.nature}`} />
              {t(`aspects.${aspect.type}`)} · {t(`planets.${other}`)}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}.${month}.${year}`;
}
