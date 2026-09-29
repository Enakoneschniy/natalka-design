/** Prices per country, in the local currency.
 *
 * One price list per currency rather than a single euro price converted on the fly: a natal
 * chart costs what the local market pays for it, and the number has to look deliberate
 * (₴790, €19, 79 zł) rather than converted. Amounts are in minor units, which is what Stripe
 * will want when payments are wired up.
 *
 * Levels agreed with the owner on 2026-09-29: ₴790 / €19 / $21 for the natal chart.
 */

export const PRODUCTS = ['natal', 'forecast', 'synastry', 'child', 'bundle'] as const;
export type ProductKey = (typeof PRODUCTS)[number];

type Currency = 'UAH' | 'EUR' | 'USD' | 'PLN' | 'CZK' | 'RON' | 'BGN' | 'GBP';

/** Minor units (kopiyky, cents, grosze …), in PRODUCTS order. */
const TABLE: Record<Currency, Record<ProductKey, number>> = {
  UAH: { natal: 79000, forecast: 59000, synastry: 69000, child: 59000, bundle: 119000 },
  EUR: { natal: 1900, forecast: 1400, synastry: 1700, child: 1400, bundle: 2900 },
  USD: { natal: 2100, forecast: 1500, synastry: 1800, child: 1500, bundle: 3200 },
  PLN: { natal: 7900, forecast: 5900, synastry: 6900, child: 5900, bundle: 11900 },
  CZK: { natal: 44900, forecast: 34900, synastry: 39900, child: 34900, bundle: 69900 },
  RON: { natal: 8900, forecast: 6900, synastry: 7900, child: 6900, bundle: 13900 },
  BGN: { natal: 3500, forecast: 2700, synastry: 3100, child: 2700, bundle: 5500 },
  GBP: { natal: 1600, forecast: 1200, synastry: 1400, child: 1200, bundle: 2500 },
};

const EUROZONE = [
  'AT',
  'BE',
  'CY',
  'DE',
  'EE',
  'ES',
  'FI',
  'FR',
  'GR',
  'HR',
  'IE',
  'IT',
  'LT',
  'LU',
  'LV',
  'MT',
  'NL',
  'PT',
  'SI',
  'SK',
];

const BY_COUNTRY: Record<string, Currency> = {
  UA: 'UAH',
  PL: 'PLN',
  CZ: 'CZK',
  RO: 'RON',
  BG: 'BGN',
  GB: 'GBP',
  ...Object.fromEntries(EUROZONE.map((country) => [country, 'EUR' as Currency])),
};

export const currencyFor = (country: string | null | undefined): Currency =>
  BY_COUNTRY[(country ?? '').toUpperCase()] ?? 'USD';

export interface Price {
  product: ProductKey;
  currency: Currency;
  /** Minor units — what the payment provider will charge. */
  amount: number;
  /** Ready to print, e.g. "₴790" or "19 €". */
  formatted: string;
}

/** Each currency is formatted in its own home locale, not the interface language: a Pole reading
 * the English site still sees "79 zł", and we avoid locales whose ICU data has no symbol for a
 * foreign currency (uk + EUR renders as "19 EUR" rather than "19 €"). Whole units only — none of
 * the price points has cents and "€19.00" reads like a form field. */
const FORMAT_LOCALE: Record<Currency, string> = {
  UAH: 'uk-UA',
  EUR: 'de-DE',
  USD: 'en-US',
  PLN: 'pl-PL',
  CZK: 'cs-CZ',
  RON: 'ro-RO',
  BGN: 'bg-BG',
  GBP: 'en-GB',
};

function format(amount: number, currency: Currency): string {
  return new Intl.NumberFormat(FORMAT_LOCALE[currency], {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: 0,
  }).format(amount / 100);
}

export function priceFor(product: ProductKey, country: string | null | undefined): Price {
  const currency = currencyFor(country);
  const amount = TABLE[currency][product];
  return { product, currency, amount, formatted: format(amount, currency) };
}

/** What the parts of the bundle would cost separately — the struck-through number next to it. */
export function bundleFullPrice(country: string | null | undefined): Price {
  const currency = currencyFor(country);
  const amount = TABLE[currency].natal + TABLE[currency].forecast;
  return { product: 'bundle', currency, amount, formatted: format(amount, currency) };
}

/** The horoscope subscription, per month, after the free first month. Agreed with the owner on
 * 2026-09-29: €4, with local figures that look like prices rather than conversions. */
const SUBSCRIPTION: Record<Currency, number> = {
  UAH: 14900,
  EUR: 400,
  USD: 500,
  PLN: 1900,
  CZK: 9900,
  RON: 1900,
  BGN: 800,
  GBP: 400,
};

export function subscriptionPrice(country: string | null | undefined): {
  currency: Currency;
  amount: number;
  formatted: string;
} {
  const currency = currencyFor(country);
  const amount = SUBSCRIPTION[currency];
  return { currency, amount, formatted: format(amount, currency) };
}

/* ---------- the price experiment ---------- */

/** The two figures under test, in euro cents. Everything else keeps the table above: the test
 * runs on euro traffic only, which is where the advertising goes. */
const EXPERIMENT_EUR: Record<string, number> = { a: 1500, b: 3500 };

/** What the bundle costs this visitor. Outside the eurozone the table decides and there is no
 * experiment to speak of. */
export function bundlePrice(
  country: string | null | undefined,
  variant: 'a' | 'b' | null,
): Price & { experiment: boolean } {
  const currency = currencyFor(country);
  if (currency === 'EUR' && variant) {
    const amount = EXPERIMENT_EUR[variant] as number;
    return {
      product: 'bundle',
      currency,
      amount,
      formatted: format(amount, currency),
      experiment: true,
    };
  }
  const amount = TABLE[currency].bundle;
  return {
    product: 'bundle',
    currency,
    amount,
    formatted: format(amount, currency),
    experiment: false,
  };
}
