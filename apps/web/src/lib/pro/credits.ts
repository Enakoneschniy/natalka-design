import type { ProLang } from './lang';
import { textFor } from './text';

/** «кредит», «кредита», «кредитов»: the noun alone, agreed with the number. */
export const creditsNoun = (n: number, lang: ProLang): string => textFor(lang).credits.noun(n);

/** «1 кредит», «3 кредита», «12 кредитов»; «3 кредити», «12 кредитів». */
export const creditsLabel = (n: number, lang: ProLang): string => textFor(lang).credits.label(n);
