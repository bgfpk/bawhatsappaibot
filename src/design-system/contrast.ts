/**
 * WCAG 2.2 Relative Luminance and Contrast Ratio Utilities
 */

export interface RGB {
  r: number; // 0-255
  g: number; // 0-255
  b: number; // 0-255
}

/**
 * Parses Hex color (#rgb, #rgba, #rrggbb, #rrggbbaa) to RGB object
 */
export function parseHexColor(hex: string): RGB {
  let clean = hex.replace(/^#/, '').trim();
  if (clean.length === 3 || clean.length === 4) {
    clean = clean
      .split('')
      .slice(0, 3)
      .map((c) => c + c)
      .join('');
  }
  if (clean.length >= 6) {
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return { r, g, b };
  }
  throw new Error(`Invalid hex color: ${hex}`);
}

/**
 * Calculates W3C WCAG relative luminance
 */
export function getRelativeLuminance(rgb: RGB): number {
  const rs = rgb.r / 255;
  const gs = rgb.g / 255;
  const bs = rgb.b / 255;

  const r = rs <= 0.04045 ? rs / 12.92 : Math.pow((rs + 0.055) / 1.055, 2.4);
  const g = gs <= 0.04045 ? gs / 12.92 : Math.pow((gs + 0.055) / 1.055, 2.4);
  const b = bs <= 0.04045 ? bs / 12.92 : Math.pow((bs + 0.055) / 1.055, 2.4);

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Calculates contrast ratio between two RGB colors (1:1 to 21:1)
 */
export function getContrastRatio(color1: RGB | string, color2: RGB | string): number {
  const rgb1 = typeof color1 === 'string' ? parseHexColor(color1) : color1;
  const rgb2 = typeof color2 === 'string' ? parseHexColor(color2) : color2;

  const l1 = getRelativeLuminance(rgb1);
  const l2 = getRelativeLuminance(rgb2);

  const brighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return (brighter + 0.05) / (darker + 0.05);
}

/**
 * Checks WCAG 2.2 AA compliance thresholds
 */
export function passesWcagAA(ratio: number, isLargeText = false, isUiComponent = false): boolean {
  if (isUiComponent || isLargeText) {
    return ratio >= 3.0;
  }
  return ratio >= 4.5;
}
