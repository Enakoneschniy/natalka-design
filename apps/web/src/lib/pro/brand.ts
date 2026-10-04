/** The seller's brand as the cabinet's form holds it, and the rules the jobs worker applies to it
 * (apps/jobs/src/pro/brand.ts), checked here first so a refusal reads in plain words. */

import { TRY_LATER } from './messages';

export type Tone = 'vy' | 'ty';

/** A brand as `GET brand` gives it. */
export interface SavedBrand {
  name: string;
  contacts: string[];
  accent: string;
  intro: string;
  outro: string;
  signature: string;
  has_logo: boolean;
  has_photo: boolean;
}

/** What the form edits: raw text, untrimmed, with blank contact lines allowed. */
export interface BrandDraft {
  name: string;
  contacts: string[];
  accent: string;
  intro: string;
  outro: string;
  signature: string;
  tone: Tone;
}

/** The body of `PUT brand`. */
export type BrandBody = BrandDraft;

export type BrandField = 'name' | 'contacts' | 'accent' | 'intro' | 'outro' | 'signature';

export const NAME_MAX = 60;
export const CONTACTS_MAX = 4;
export const CONTACT_MAX = 80;
export const TEXT_MAX = 3000;
export const SIGNATURE_MAX = 80;
export const IMAGE_MAX_BYTES = 1_048_576;
export const IMAGE_TYPES = ['image/png', 'image/jpeg'] as const;

export const DEFAULT_ACCENT = '#E7B75C';

/** The swatches offered, all readable on the night cover. */
export const ACCENTS = [DEFAULT_ACCENT, '#8E7CC3', '#D98CA6', '#7FB8C9', '#9BC48A', '#F2F0EA'];

/** Below this relative luminance an accent is hard to see on the dark cover. */
export const LOW_LUMINANCE = 0.18;

export const LOW_CONTRAST_WARNING = 'Плохо видно на тёмной обложке';

export const TONE_SAMPLE: Record<Tone, string> = {
  vy: 'Ваша Луна в Раке говорит о том, что вам важно чувствовать опору дома.',
  ty: 'Твоя Луна в Раке говорит о том, что тебе важно чувствовать опору дома.',
};

export const BRAND_FIELD_ERROR: Record<BrandField, string> = {
  name: `Имя: от 1 до ${NAME_MAX} символов`,
  contacts: `Контакты: не больше ${CONTACTS_MAX} строк, каждая до ${CONTACT_MAX} символов`,
  accent: 'Цвет в формате #RRGGBB, например #E7B75C',
  intro: `Вступление: не больше ${TEXT_MAX} символов`,
  outro: `Заключение: не больше ${TEXT_MAX} символов`,
  signature: `Подпись: не больше ${SIGNATURE_MAX} символов`,
};

const ACCENT = /^#[0-9A-Fa-f]{6}$/;

export const isAccent = (value: string): boolean => ACCENT.test(value);

/** WCAG relative luminance of a `#RRGGBB` colour: 0 for black, 1 for white. */
export function relativeLuminance(hex: string): number {
  const channel = (at: number) => {
    const c = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** True when a complete accent is too dark for the night cover; a colour still being typed is
 * not judged. */
export const lowContrast = (accent: string): boolean =>
  isAccent(accent) && relativeLuminance(accent) < LOW_LUMINANCE;

/** The contact lines that count: trimmed, blanks dropped. */
const contactLines = (contacts: string[]): string[] =>
  contacts.map((line) => line.trim()).filter((line) => line.length > 0);

/** Which fields break the jobs worker's rules, each with its message. Empty when all is well. */
export function checkBrand(draft: BrandDraft): Partial<Record<BrandField, string>> {
  const errors: Partial<Record<BrandField, string>> = {};
  const name = draft.name.trim();
  if (name.length < 1 || name.length > NAME_MAX) errors.name = BRAND_FIELD_ERROR.name;
  const contacts = contactLines(draft.contacts);
  if (contacts.length > CONTACTS_MAX || contacts.some((line) => line.length > CONTACT_MAX)) {
    errors.contacts = BRAND_FIELD_ERROR.contacts;
  }
  if (!isAccent(draft.accent.trim())) errors.accent = BRAND_FIELD_ERROR.accent;
  if (draft.intro.trim().length > TEXT_MAX) errors.intro = BRAND_FIELD_ERROR.intro;
  if (draft.outro.trim().length > TEXT_MAX) errors.outro = BRAND_FIELD_ERROR.outro;
  if (draft.signature.trim().length > SIGNATURE_MAX) errors.signature = BRAND_FIELD_ERROR.signature;
  return errors;
}

/** The `PUT brand` body for a draft, or null when any field breaks the rules. */
export function brandBody(draft: BrandDraft): BrandBody | null {
  if (Object.keys(checkBrand(draft)).length > 0) return null;
  return {
    name: draft.name.trim(),
    contacts: contactLines(draft.contacts),
    accent: draft.accent.trim(),
    intro: draft.intro.trim(),
    outro: draft.outro.trim(),
    signature: draft.signature.trim(),
    tone: draft.tone,
  };
}

/** The form's first state: the saved brand, or an empty one with a single contact line. */
export function draftFromBrand(brand: SavedBrand | null, tone: Tone): BrandDraft {
  if (!brand) {
    return {
      name: '',
      contacts: [''],
      accent: DEFAULT_ACCENT,
      intro: '',
      outro: '',
      signature: '',
      tone,
    };
  }
  return {
    name: brand.name,
    contacts: brand.contacts.length > 0 ? [...brand.contacts] : [''],
    accent: brand.accent,
    intro: brand.intro,
    outro: brand.outro,
    signature: brand.signature,
    tone,
  };
}

/** The brand name as the PDF cover sets it: capitals with a space between every letter. */
export const spacedName = (name: string): string => [...name.trim().toUpperCase()].join(' ');

/** A date as the PDF cover writes it. */
export function coverDate(date: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(date.getUTCDate())}.${two(date.getUTCMonth() + 1)}.${date.getUTCFullYear()}`;
}

/** Why a chosen file cannot be uploaded, or null when it can. */
export function imageProblem(file: { size: number; type: string }): string | null {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) return 'Нужен файл PNG или JPEG';
  if (file.size === 0) return 'Файл пустой';
  if (file.size > IMAGE_MAX_BYTES) return 'Файл больше 1 МБ, уменьшите его';
  return null;
}

export const NO_BRAND = 'Сначала сохраните имя бренда';

/** What an image upload's answer means for the seller. */
export function imageError(status: number, error?: string): string {
  if (status === 409 || error === 'no_brand') return NO_BRAND;
  if (status === 413) return 'Файл больше 1 МБ, уменьшите его';
  if (status === 415) return 'Нужен файл PNG или JPEG';
  if (status === 400) return 'Не удалось прочитать картинку: нужен PNG или JPEG до 4000 px';
  return TRY_LATER;
}

/** What a refused `PUT brand` means for the seller. */
export function brandSaveError(status: number, error?: string): string {
  if (status === 400 && error === 'tone') return 'Выберите обращение: на «вы» или на «ты»';
  if (status === 400) return 'Проверьте поля: сервер их не принял';
  return TRY_LATER;
}
