import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { LANG_COOKIE, type ProLang, pickLang } from './lang';
import { type ProText, textFor } from './text';

/** The visitor's cabinet language, once per request: their choice, their browser, their country. */
export const proLang = cache(async (): Promise<ProLang> => {
  const [jar, head] = await Promise.all([cookies(), headers()]);
  return pickLang(
    jar.get(LANG_COOKIE)?.value,
    head.get('accept-language'),
    head.get('cf-ipcountry'),
  );
});

/** The cabinet's words in the visitor's language, for server pages. */
export const proText = async (): Promise<ProText> => textFor(await proLang());

/** A page title in the visitor's language. */
export const titleOf = (key: keyof ProText['meta']) => async (): Promise<{ title: string }> => ({
  title: (await proText()).meta[key],
});
