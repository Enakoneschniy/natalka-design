'use client';

import { createContext, useContext } from 'react';
import { LANG_COOKIE, LANG_COOKIE_MAX_AGE, PRO_LANGS, type ProLang } from '@/lib/pro/lang';
import { type ProText, textFor } from '@/lib/pro/text';

const LangContext = createContext<ProLang>('ru');

/** The language the server rendered the page in, for the client components under it. */
export function LangProvider({ lang, children }: { lang: ProLang; children?: React.ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export const useLang = (): ProLang => useContext(LangContext);

export const useText = (): ProText => textFor(useLang());

/** Remembers the visitor's language for a year and loads the page again in it: every part of it,
 * server-rendered or not, speaks the new language at once. */
function choose(lang: ProLang) {
  const secure = window.location.protocol === 'https:' ? '; secure' : '';
  // biome-ignore lint/suspicious/noDocumentCookie: the Cookie Store API is not in every browser the cabinet serves
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=${LANG_COOKIE_MAX_AGE}; samesite=lax${secure}`;
  window.location.reload();
}

/** «UA · RU»: the cabinet's language, one tap away on every page. `full` spells the names out. */
export function LangSwitch({ full = false }: { full?: boolean }) {
  const lang = useLang();
  const t = useText();
  return (
    <fieldset className={full ? 'seg' : 'lang-switch'}>
      <legend className="visually-hidden">{t.lang.switchLabel}</legend>
      {PRO_LANGS.map((option) => (
        <button
          key={option}
          type="button"
          lang={option}
          aria-pressed={lang === option}
          aria-label={full ? undefined : t.lang.name[option]}
          onClick={() => lang !== option && choose(option)}
        >
          {full ? t.lang.name[option] : t.lang.short[option]}
        </button>
      ))}
    </fieldset>
  );
}
