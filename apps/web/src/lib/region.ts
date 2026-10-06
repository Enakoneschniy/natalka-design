/** Where the service is not offered at all. Russia is not a market: payments are impossible
 * there. The middleware shows these visitors the "unavailable" page; the worker entry refuses
 * their API calls, which the middleware never sees. */
export const CLOSED_COUNTRIES: ReadonlySet<string> = new Set(['RU']);

/** `cf-ipcountry` is two letters from Cloudflare; locally it is absent. */
export const isClosedCountry = (country: string | null | undefined): boolean =>
  CLOSED_COUNTRIES.has((country ?? '').trim().toUpperCase());
