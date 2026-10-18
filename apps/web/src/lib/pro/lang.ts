/** The cabinet's two languages and how a visitor's is chosen. Pure: the server layout, the
 * switch and the tests share it. */

export type ProLang = 'ru' | 'uk';

export const PRO_LANGS: readonly ProLang[] = ['uk', 'ru'];

/** The visitor's own choice, set by the switch. Not a secret: a plain, readable cookie. */
export const LANG_COOKIE = 'chp_lang';
export const LANG_COOKIE_MAX_AGE = 31_536_000;

export const isProLang = (value: unknown): value is ProLang => value === 'ru' || value === 'uk';

/** The languages a browser asks for, most wanted first, as bare primary subtags. */
function asked(acceptLanguage: string | null | undefined): string[] {
  return (acceptLanguage ?? '')
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      const weight = q ? Number(q.slice(2)) : 1;
      return {
        lang: tag.trim().toLowerCase().split('-')[0] ?? '',
        weight: Number.isFinite(weight) ? weight : 0,
        index,
      };
    })
    .filter((entry) => entry.lang && entry.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index)
    .map((entry) => entry.lang);
}

/** The cabinet's language: the visitor's choice; else the first of Ukrainian and Russian their
 * browser asks for; else Ukrainian for a visitor in Ukraine; else Russian. */
export function pickLang(
  cookie: string | null | undefined,
  acceptLanguage: string | null | undefined,
  country: string | null | undefined,
): ProLang {
  if (isProLang(cookie)) return cookie;
  const found = asked(acceptLanguage).find(isProLang);
  if (found) return found;
  return country?.trim().toUpperCase() === 'UA' ? 'uk' : 'ru';
}

/** The language of a request to one of the cabinet's own routes, picked as the pages pick it. */
export function requestLang(request: Request): ProLang {
  const cookie = (request.headers.get('cookie') ?? '')
    .split(';')
    .map((part) => part.trim().split('='))
    .find(([name]) => name === LANG_COOKIE)?.[1];
  return pickLang(
    cookie,
    request.headers.get('accept-language'),
    request.headers.get('cf-ipcountry'),
  );
}

export interface Forms {
  one: string;
  few: string;
  many: string;
}

const RULES: Record<ProLang, Intl.PluralRules> = {
  ru: new Intl.PluralRules('ru'),
  uk: new Intl.PluralRules('uk'),
};

/** The form of a noun that agrees with `n`: «1 кредит», «3 кредити», «12 кредитів». */
export function plural(lang: ProLang, n: number, forms: Forms): string {
  const rule = RULES[lang].select(n);
  return rule === 'one' ? forms.one : rule === 'few' ? forms.few : forms.many;
}
