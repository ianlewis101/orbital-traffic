/**
 * "Deep Field" design tokens.
 *
 * A reimagined visual language for Orbital Traffic: a calm, editorial
 * mission-control aesthetic — deep space-black canvas, crisp translucent
 * panels, a confident sky-blue primary and a warm amber accent. Exposed both
 * as TypeScript values (for Three.js / inline styles) and as CSS custom
 * properties (`tokens.css`) so the DOM and the 3D scene stay in lock-step.
 */

export const color = {
  /** Page canvas — near-black with a trace of blue. */
  bg: '#05060b',
  bgElevated: '#0a0d16',
  /** Translucent panel fill (sits over the 3D scene). */
  surface: 'rgba(16, 20, 32, 0.72)',
  surfaceSolid: '#10141f',
  surfaceHover: 'rgba(28, 34, 50, 0.82)',

  border: 'rgba(148, 163, 184, 0.16)',
  borderStrong: 'rgba(148, 163, 184, 0.32)',

  text: '#eef2fb',
  textDim: '#9aa3b8',
  textFaint: '#626b80',

  /** Brand primary — electric sky blue. */
  primary: '#38bdf8',
  primaryDim: '#0ea5e9',
  primarySoft: 'rgba(56, 189, 248, 0.14)',
  /** Secondary accent — warm amber, used sparingly for emphasis/CTAs. */
  accent: '#fbbf24',
  accentSoft: 'rgba(251, 191, 36, 0.14)',

  good: '#34d399',
  warn: '#fbbf24',
  bad: '#fb7185',
} as const;

/** 4px-based spacing scale. */
export function space(steps: number): string {
  return `${steps * 4}px`;
}

export const radius = {
  sm: '8px',
  md: '12px',
  lg: '18px',
  xl: '24px',
  pill: '999px',
} as const;

export const font = {
  sans: "'Space Grotesk', ui-sans-serif, system-ui, -apple-system, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace",
} as const;

export const fontSize = {
  micro: '9px',
  tiny: '10px',
  xs: '11px',
  sm: '13px',
  md: '15px',
  lg: '20px',
  xl: '28px',
  display: '40px',
} as const;

export const shadow = {
  panel: '0 18px 50px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
  pop: '0 8px 28px rgba(0, 0, 0, 0.45)',
} as const;

export const motion = {
  fast: '120ms',
  base: '220ms',
  slow: '420ms',
  ease: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
} as const;

/** Stacking order for the HUD layers. */
export const z = {
  scene: 0,
  hud: 10,
  panel: 20,
  overlay: 40,
  tooltip: 60,
  splash: 80,
} as const;

export const tokens = { color, radius, font, fontSize, shadow, motion, z, space };
export type Tokens = typeof tokens;
