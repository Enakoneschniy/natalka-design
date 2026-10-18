/** The seller's brand as the cabinet's form holds it, and the rules the jobs worker applies to it
 * (apps/jobs/src/pro/brand.ts), checked here first so a refusal reads in plain words. */

import type { ProLang } from './lang';
import { textFor } from './text';

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
/** The most the jobs worker stores for one picture. */
export const IMAGE_MAX_BYTES = 1_048_576;
/** The most a chosen file may be before the browser shrinks it: a phone photo is a few MB. */
export const SOURCE_MAX_BYTES = 26_214_400;
/** The long side a picture is shrunk to. The PDF draws the logo at most 5 cm wide and the photo
 * 4.5 × 7 cm, which is under 900 px at 300 dpi. */
export const IMAGE_MAX_SIDE = 1200;

export type ImageKind = 'logo' | 'photo';

/** What a prepared picture is saved as, first choice first: transparency survives only in a PNG;
 * a logo without it may still fall back to JPEG to fit the cap, a photo without it is a JPEG. */
export const OUTPUT_TYPES: Record<ImageKind, { transparent: string[]; opaque: string[] }> = {
  logo: { transparent: ['image/png'], opaque: ['image/png', 'image/jpeg'] },
  photo: { transparent: ['image/png'], opaque: ['image/jpeg'] },
};

export const DEFAULT_ACCENT = '#E7B75C';

/** The swatches offered, all readable on the night cover. */
export const ACCENTS = [DEFAULT_ACCENT, '#8E7CC3', '#D98CA6', '#7FB8C9', '#9BC48A', '#F2F0EA'];

/** Below this relative luminance an accent is hard to see on the dark cover. */
export const LOW_LUMINANCE = 0.18;

/** What each field's rule says when it is broken, in the cabinet's language. */
export function brandFieldError(field: BrandField, lang: ProLang): string {
  const errors = textFor(lang).brand.errors;
  switch (field) {
    case 'name':
      return errors.name(NAME_MAX);
    case 'contacts':
      return errors.contacts(CONTACTS_MAX, CONTACT_MAX);
    case 'accent':
      return errors.accent;
    case 'intro':
      return errors.intro(TEXT_MAX);
    case 'outro':
      return errors.outro(TEXT_MAX);
    case 'signature':
      return errors.signature(SIGNATURE_MAX);
  }
}

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

/** Which fields break the jobs worker's rules. Empty when all is well. */
export function brandProblems(draft: BrandDraft): BrandField[] {
  const problems: BrandField[] = [];
  const name = draft.name.trim();
  if (name.length < 1 || name.length > NAME_MAX) problems.push('name');
  const contacts = contactLines(draft.contacts);
  if (contacts.length > CONTACTS_MAX || contacts.some((line) => line.length > CONTACT_MAX)) {
    problems.push('contacts');
  }
  if (!isAccent(draft.accent.trim())) problems.push('accent');
  if (draft.intro.trim().length > TEXT_MAX) problems.push('intro');
  if (draft.outro.trim().length > TEXT_MAX) problems.push('outro');
  if (draft.signature.trim().length > SIGNATURE_MAX) problems.push('signature');
  return problems;
}

/** Which fields break the jobs worker's rules, each with its message. Empty when all is well. */
export function checkBrand(draft: BrandDraft, lang: ProLang): Partial<Record<BrandField, string>> {
  return Object.fromEntries(
    brandProblems(draft).map((field) => [field, brandFieldError(field, lang)]),
  );
}

/** The `PUT brand` body for a draft, or null when any field breaks the rules. */
export function brandBody(draft: BrandDraft): BrandBody | null {
  if (brandProblems(draft).length > 0) return null;
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

/** Why a chosen file cannot even be tried, or null when the browser may open it. Any picture is
 * welcome, whatever its size: it is shrunk and saved as PNG or JPEG before upload. A file without
 * a type (a HEIC on a desktop) is left for the browser to try. */
export function imageProblem(file: { size: number; type: string }, lang: ProLang): string | null {
  const t = textFor(lang).brand.image;
  if (file.type !== '' && !file.type.startsWith('image/')) return t.notPicture;
  if (file.size === 0) return t.empty;
  if (file.size > SOURCE_MAX_BYTES) return t.tooBigSource;
  return null;
}

/** The size a `width` × `height` picture is drawn at so its long side is at most `max`. A
 * photo is never enlarged; a drawing (`enlarge`, an SVG) is drawn at `max`, since it has no
 * pixels of its own to lose. */
export function fitWithin(
  width: number,
  height: number,
  max: number,
  enlarge = false,
): { width: number; height: number } {
  const fit = max / Math.max(width, height);
  const scale = enlarge ? fit : Math.min(1, fit);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** A file the jobs worker takes as it is: a PNG or JPEG up to the cap. Sent when the browser
 * could not prepare it, as every upload was before preparing existed. */
export const canSendAsIs = (file: { size: number; type: string }): boolean =>
  (file.type === 'image/png' || file.type === 'image/jpeg') &&
  file.size > 0 &&
  file.size <= IMAGE_MAX_BYTES;

/** What an image upload's answer means for the seller. */
export function imageError(status: number, error: string | undefined, lang: ProLang): string {
  const t = textFor(lang);
  if (status === 409 || error === 'no_brand') return t.brand.image.noBrand;
  if (status === 413) return t.brand.image.tooBig;
  if (status === 415) return t.brand.image.wrongType;
  if (status === 400) return t.brand.image.refused;
  return t.common.tryLater;
}

/** What a refused `PUT brand` means for the seller. */
export function brandSaveError(status: number, error: string | undefined, lang: ProLang): string {
  const t = textFor(lang);
  if (status === 400 && error === 'tone') return t.brand.saveTone;
  if (status === 400) return t.brand.saveRefused;
  return t.common.tryLater;
}
