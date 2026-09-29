import { headers } from 'next/headers';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { HeroFilm } from '@/components/HeroFilm';
import { HeroOrrery } from '@/components/HeroOrrery';
import { HeroScene } from '@/components/HeroScene';
import { HeroWheel } from '@/components/HeroWheel';
import type { Locale } from '@/i18n/routing';
import type { ChartFacts } from '@/lib/chart';
import demo from '@/lib/demo-chart.json';
import { PLANET_PATHS } from '@/lib/glyphs';
import { PRODUCTS, type ProductKey, priceFor, subscriptionPrice } from '@/lib/pricing';

const facts = demo as unknown as ChartFacts;

/** Which hero is live. `wheel` is the first one — the demo chart with two orbit rings, text and
 * buttons beside it; `orrery` the solar-system sketch; `scene` the whole screen as one motion
 * piece. Each is kept whole, so the switch back is this one word. */
type HeroKind = 'film' | 'scene' | 'orrery' | 'wheel';
const HERO = 'film' as HeroKind;

const PRODUCT_GLYPH: Record<string, string> = {
  natal: PLANET_PATHS.sun ?? '',
  forecast: PLANET_PATHS.saturn ?? '',
  synastry: PLANET_PATHS.venus ?? '',
  child: PLANET_PATHS.moon ?? '',
};

export default async function LandingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const country = (await headers()).get('cf-ipcountry');
  // Prices are resolved on the server so the page ships one currency, not a client-side switch.
  const prices = Object.fromEntries(
    PRODUCTS.map((product) => [product, priceFor(product, country).formatted]),
  ) as Record<ProductKey, string>;
  const subscription = subscriptionPrice(country).formatted;
  return <Landing locale={locale as Locale} prices={prices} subscription={subscription} />;
}

function Landing({
  locale,
  prices,
  subscription,
}: {
  locale: Locale;
  prices: Record<ProductKey, string>;
  subscription: string;
}) {
  const t = useTranslations();
  const products = ['natal', 'forecast', 'synastry', 'child'] as const;
  const steps = [0, 1, 2] as const;
  const faq = [0, 1, 2, 3] as const;

  return (
    <>
      {HERO === 'film' ? (
        <section className="hero hero-film">
          <HeroFilm facts={facts} locale={locale} />
        </section>
      ) : HERO === 'scene' ? (
        <section className="hero hero-scene">
          <HeroScene facts={facts} />
        </section>
      ) : (
        <section className="hero">
          <div className="container-page hero-grid">
            <div className="hero-text">
              <h1>
                {t('hero.titleLead')} <em>{t('hero.titleAccent')}</em>
              </h1>
              <p className="lead">{t('hero.lead')}</p>
              <div className="hero-cta">
                <Link className="btn btn-primary btn-lg" href={`/${locale}/start`}>
                  {t('hero.cta')}
                </Link>
                <Link className="btn btn-secondary btn-lg" href={`/${locale}/preview?demo=1`}>
                  {t('hero.secondary')}
                </Link>
              </div>
              <ul className="hero-facts">
                <li>
                  <strong>{t('hero.facts.accuracy')}</strong>
                  <span>{t('hero.facts.accuracyLabel')}</span>
                </li>
                <li>
                  <strong>{t('hero.facts.speed')}</strong>
                  <span>{t('hero.facts.speedLabel')}</span>
                </li>
                <li>
                  <strong>{t('hero.facts.count')}</strong>
                  <span>{t('hero.facts.countLabel')}</span>
                </li>
              </ul>
            </div>
            <div className="hero-wheel">
              {HERO === 'orrery' ? <HeroOrrery /> : <HeroWheel facts={facts} />}
            </div>
          </div>
        </section>
      )}

      <section className="section" id="products">
        <div className="container-page">
          <div className="section-title">
            <h2>{t('products.title')}</h2>
            <p className="lead">{t('products.lead')}</p>
          </div>
          <div className="grid-4">
            {products.map((key) => (
              <article className="card product" key={key}>
                {/* The glyph is the product's own: the Sun for a natal chart, Saturn for a
                    forecast (it is the planet that keeps time), Venus for compatibility, the Moon
                    for a child. Decoration that says which card you are looking at. */}
                <svg
                  className="product-mark"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d={PRODUCT_GLYPH[key]} />
                </svg>
                <h3>{t(`products.${key}.title`)}</h3>
                <p className="meta">{t(`products.${key}.meta`)}</p>
                <ul>
                  {[0, 1, 2, 3].map((i) => (
                    <li key={i}>{t(`products.${key}.items.${i}`)}</li>
                  ))}
                </ul>
                <div className="spacer" />
                <p className="price">
                  {prices[key]} <small>{t('products.once')}</small>
                </p>
                <Link className="btn btn-secondary btn-block" href={`/${locale}/start?p=${key}`}>
                  {t('products.choose')}
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="horoscope">
        <div className="container-page">
          <div className="card subscription-card">
            <div className="subscription-text">
              <h2>{t('subscription.sectionTitle')}</h2>
              <p className="lead">{t('subscription.sectionLead', { price: subscription })}</p>
              <ul className="subscription-items">
                {([0, 1, 2, 3] as const).map((i) => (
                  <li key={i}>{t(`subscription.sectionItems.${i}`)}</li>
                ))}
              </ul>
              <div className="subscription-cta">
                <Link className="btn btn-primary btn-lg" href={`/${locale}/start?p=horoscope`}>
                  {t('subscription.sectionCta')}
                </Link>
                <span className="caption">
                  {t('subscription.trial')} · {t('subscription.then', { price: subscription })}
                </span>
              </div>
            </div>
            <div className="subscription-art" aria-hidden="true">
              <span className="subscription-ring subscription-ring-1" />
              <span className="subscription-ring subscription-ring-2">
                <span className="subscription-dot" />
              </span>
              <span className="subscription-ring subscription-ring-3" />
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="how">
        <div className="container-page">
          <div className="section-title">
            <h2>{t('how.title')}</h2>
          </div>
          <ol className="steps">
            {steps.map((i) => (
              <li key={i}>
                <span className="step-n mono">{`0${i + 1}`}</span>
                <h3>{t(`how.steps.${i}.title`)}</h3>
                <p className="muted">{t(`how.steps.${i}.text`)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section" id="faq">
        <div className="container-page faq-grid">
          <div className="section-title">
            <h2>{t('faq.title')}</h2>
            <p className="muted">
              {t('faq.contact')} <a href="mailto:help@chronika.me">help@chronika.me</a>
              {t('faq.contactAfter')}
            </p>
          </div>
          <div className="faq">
            {faq.map((i) => (
              <details key={i} open={i === 0}>
                <summary>{t(`faq.items.${i}.q`)}</summary>
                <div className="answer">{t(`faq.items.${i}.a`)}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="section cta-final">
        <div className="container-page">
          <div className="cta-card">
            <div>
              <h2>{t('cta.title')}</h2>
              <p className="muted">{t('cta.lead')}</p>
            </div>
            <Link className="btn btn-primary btn-lg" href={`/${locale}/start`}>
              {t('cta.button')}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
