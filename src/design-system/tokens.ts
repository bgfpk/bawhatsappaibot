/**
 * BlackArrow Design System Tokens Definitions in TypeScript
 */

export const COLOR_TOKENS = {
  canvas0: 'var(--ca-canvas-0)',
  canvas1: 'var(--ca-canvas-1)',
  canvas2: 'var(--ca-canvas-2)',
  surface0: 'var(--ca-surface-0)',
  surface1: 'var(--ca-surface-1)',
  surface2: 'var(--ca-surface-2)',
  surface3: 'var(--ca-surface-3)',
  surface4: 'var(--ca-surface-4)',
  surfaceElevated: 'var(--ca-surface-elevated)',
  overlay: 'var(--ca-overlay)',
  borderSubtle: 'var(--ca-border-subtle)',
  borderDefault: 'var(--ca-border-default)',
  borderStrong: 'var(--ca-border-strong)',
  textPrimary: 'var(--ca-text-primary)',
  textSecondary: 'var(--ca-text-secondary)',
  textMuted: 'var(--ca-text-muted)',
  textFaint: 'var(--ca-text-faint)',
  textInverse: 'var(--ca-text-inverse)',
  brand: 'var(--ca-brand)',
  brandHover: 'var(--ca-brand-hover)',
  brandActive: 'var(--ca-brand-active)',
  brandSoft: 'var(--ca-brand-soft)',
  focusRing: 'var(--ca-focus-ring)',
  success: 'var(--ca-success)',
  warning: 'var(--ca-warning)',
  danger: 'var(--ca-danger)',
  info: 'var(--ca-info)',
  disabledBg: 'var(--ca-disabled-bg)',
  disabledFg: 'var(--ca-disabled-fg)',
  selectionBg: 'var(--ca-selection-bg)',
  skeletonBg: 'var(--ca-skeleton-bg)',
} as const;

export const SPACING_SCALE = {
  0: 'var(--ca-space-0)',
  1: 'var(--ca-space-1)',
  2: 'var(--ca-space-2)',
  3: 'var(--ca-space-3)',
  4: 'var(--ca-space-4)',
  5: 'var(--ca-space-5)',
  6: 'var(--ca-space-6)',
  7: 'var(--ca-space-7)',
  8: 'var(--ca-space-8)',
  9: 'var(--ca-space-9)',
  10: 'var(--ca-space-10)',
  11: 'var(--ca-space-11)',
} as const;

export const RADIUS_SCALE = {
  none: 'var(--ca-radius-none)',
  sm: 'var(--ca-radius-sm)',
  md: 'var(--ca-radius-md)',
  lg: 'var(--ca-radius-lg)',
  xl: 'var(--ca-radius-xl)',
  pill: 'var(--ca-radius-pill)',
} as const;

export const Z_INDEX = {
  base: 0,
  sticky: 10,
  header: 20,
  dropdown: 30,
  popover: 40,
  drawer: 50,
  modal: 60,
  toast: 70,
  alert: 80,
} as const;

export type ColorTokenName = keyof typeof COLOR_TOKENS;
export type SpacingScaleKey = keyof typeof SPACING_SCALE;
export type RadiusScaleKey = keyof typeof RADIUS_SCALE;
