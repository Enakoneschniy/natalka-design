// SVG glyph outlines (24×24), shared with design/wheel.js and packages/document/glyphs.py.

export const SIGN_KEYS = [
  'aries',
  'taurus',
  'gemini',
  'cancer',
  'leo',
  'virgo',
  'libra',
  'scorpio',
  'sagittarius',
  'capricorn',
  'aquarius',
  'pisces',
] as const;

export type SignKey = (typeof SIGN_KEYS)[number];

export const SIGN_PATHS: Record<SignKey, string> = {
  aries: 'M12 21V11C12 6 7 4 5 8M12 11C12 6 17 4 19 8',
  taurus: 'M4 4C5 9 8 11 12 11C16 11 19 9 20 4M12 21a5 5 0 1 0 0-10a5 5 0 0 0 0 10',
  gemini: 'M9 6V18M15 6V18M5 5C8 7 16 7 19 5M5 19C8 17 16 17 19 19',
  cancer:
    'M4 8C7 3 16 4 20 8M20 16C17 21 8 20 4 16M10 10a2.5 2.5 0 1 1-5 0a2.5 2.5 0 0 1 5 0M19 14a2.5 2.5 0 1 1-5 0a2.5 2.5 0 0 1 5 0',
  leo: 'M9 18a3 3 0 1 1 0-6C8 8 9 4 12 4C15 4 16 8 15 11C14 14 13 16 14 18C15 20 18 19 18 17',
  virgo:
    'M4 8C4 5 8 5 8 8V17M8 8C8 5 12 5 12 8V17M12 8C12 5 16 5 16 8V14C16 17 13 19 10 19M16 14C18 14 20 16 19 20',
  libra: 'M4 15H8A4 4 0 1 1 16 15H20M4 19H20',
  scorpio:
    'M4 8C4 5 8 5 8 8V17M8 8C8 5 12 5 12 8V17M12 8C12 5 16 5 16 8V16C16 18.5 17.5 19.5 20 19.5M18 17.5L20.5 19.5L18.5 21.5',
  sagittarius: 'M5 19L19 5M12 5H19V12M8 10L14 16',
  capricorn: 'M4 6L8 12L12 5V15C12 19 15 20 17 18C19 16 17 13 14 14C11 15 10 18 12 21',
  aquarius: 'M3 9l3-2.5 3 2.5 3-2.5 3 2.5 3-2.5 3 2.5M3 15l3-2.5 3 2.5 3-2.5 3 2.5 3-2.5 3 2.5',
  pisces: 'M6 4C10 8 10 16 6 20M18 4C14 8 14 16 18 20M5 12H19',
};

export const PLANET_PATHS: Record<string, string> = {
  sun: 'M19 12a7 7 0 1 1-14 0a7 7 0 0 1 14 0M13.5 12a1.5 1.5 0 1 1-3 0a1.5 1.5 0 0 1 3 0',
  moon: 'M13 3A9 9 0 1 0 13 21A7 7 0 0 1 13 3Z',
  mercury: 'M16 11a4 4 0 1 1-8 0a4 4 0 0 1 8 0M12 15V21M9 18H15M8 3C8 6 10 7 12 7C14 7 16 6 16 3',
  venus: 'M17 9a5 5 0 1 1-10 0a5 5 0 0 1 10 0M12 14V21M9 18H15',
  mars: 'M15 14a5 5 0 1 1-10 0a5 5 0 0 1 10 0M13.5 10.5L20 4M15 4H20V9',
  jupiter: 'M5 8C5 4 10 3 11 7C11 10 7 12 4 13H18M15 3V20',
  saturn: 'M9 3H15M12 3V14M12 8C15 5 20 8 18 14C17 17 14 19 13 21',
  uranus: 'M6 4V16M18 4V16M6 10H18M12 4V15M14.5 18a2.5 2.5 0 1 1-5 0a2.5 2.5 0 0 1 5 0',
  neptune: 'M5 5C5 12 8 13 12 13C16 13 19 12 19 5M12 3V21M8 18H16',
  pluto: 'M15 7a3 3 0 1 1-6 0a3 3 0 0 1 6 0M6 5C6 14 18 14 18 5M12 14V21M8 18H16',
  north_node: 'M8 19A7 7 0 1 1 16 19M4 19H8M16 19H20',
  south_node: 'M8 5A7 7 0 1 0 16 5M4 5H8M16 5H20',
  chiron: 'M15 18a3 3 0 1 1-6 0a3 3 0 0 1 6 0M12 15V3M12 9l5-5M12 9l5 5',
  lilith: 'M14 3A7 7 0 1 0 14 15A5.5 5.5 0 0 1 14 3ZM12 15V21M9 18H15',
};

export const ASPECT_PATHS: Record<string, string> = {
  conjunction: 'M15 13a5 5 0 1 1-10 0a5 5 0 0 1 10 0M13 9L20 2',
  opposition: 'M9 7a4 4 0 1 1-8 0a4 4 0 0 1 8 0M23 17a4 4 0 1 1-8 0a4 4 0 0 1 8 0M8 10L16 14',
  trine: 'M12 4L21 20H3Z',
  square: 'M4 4H20V20H4Z',
  sextile: 'M12 3V21M4 7.5L20 16.5M4 16.5L20 7.5',
};

/** Bodies drawn on the wheel; Lilith and the South Node stay in the table only. */
export const WHEEL_BODIES = [
  'sun',
  'moon',
  'mercury',
  'venus',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
  'pluto',
  'chiron',
  'north_node',
] as const;

export const ASPECT_BODIES = new Set([...WHEEL_BODIES.slice(0, 10), 'asc', 'mc']);
