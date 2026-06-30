import type { CategoryId, CategoryMeta } from './types.js';

/**
 * The canonical orbit-class registry. A single source of truth for labels,
 * colours, and accessibility glyphs, consumed by both the 3D renderer
 * (numeric `color`) and the DOM HUD (`cssColor`).
 */
export const CATEGORIES: Record<CategoryId, CategoryMeta> = {
  stations: {
    id: 'stations',
    label: 'Stations',
    color: 0xffd23d,
    cssColor: '#ffd23d',
    glyph: '◇',
    px: 6,
    hiddenByDefault: false,
  },
  navigation: {
    id: 'navigation',
    label: 'Navigation',
    color: 0xb39bff,
    cssColor: '#b39bff',
    glyph: '▲',
    px: 4,
    hiddenByDefault: false,
  },
  geostationary: {
    id: 'geostationary',
    label: 'Geostationary',
    color: 0x4ff0c0,
    cssColor: '#4ff0c0',
    glyph: '■',
    px: 4,
    hiddenByDefault: false,
  },
  starlink: {
    id: 'starlink',
    label: 'Starlink / OneWeb',
    color: 0x8fd6ff,
    cssColor: '#8fd6ff',
    glyph: '•',
    px: 3,
    hiddenByDefault: false,
  },
  science: {
    id: 'science',
    label: 'Science',
    color: 0xff8fb0,
    cssColor: '#ff8fb0',
    glyph: '✦',
    px: 4,
    hiddenByDefault: false,
  },
  communications: {
    id: 'communications',
    label: 'Communications',
    color: 0xff8c00,
    cssColor: '#ff8c00',
    glyph: '◆',
    px: 4,
    hiddenByDefault: false,
  },
  other: {
    id: 'other',
    label: 'Other payloads',
    color: 0xc3cede,
    cssColor: '#c3cede',
    glyph: '○',
    px: 3,
    hiddenByDefault: false,
  },
  debris: {
    id: 'debris',
    label: 'Debris & rocket bodies',
    color: 0x7a8899,
    cssColor: '#7a8899',
    glyph: '×',
    px: 3,
    hiddenByDefault: true,
  },
  hazardous: {
    id: 'hazardous',
    label: 'Hazardous NEOs',
    color: 0xff4422,
    cssColor: '#ff4422',
    glyph: '⬡',
    px: 6,
    hiddenByDefault: false,
  },
};

/** Stable display order for legends and layer controls. */
export const CATEGORY_ORDER: CategoryId[] = [
  'stations',
  'navigation',
  'geostationary',
  'starlink',
  'science',
  'communications',
  'other',
  'debris',
  'hazardous',
];

export function categoryMeta(id: CategoryId): CategoryMeta {
  return CATEGORIES[id];
}

export function isCategoryId(value: string): value is CategoryId {
  return value in CATEGORIES;
}
