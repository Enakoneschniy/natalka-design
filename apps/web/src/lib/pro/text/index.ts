import type { ProLang } from '../lang';
import { type ProText, ru } from './ru';
import { uk } from './uk';

export type { ProText };

/** The cabinet's words in each of its languages. */
export const TEXT: Record<ProLang, ProText> = { ru, uk };

export const textFor = (lang: ProLang): ProText => TEXT[lang];
