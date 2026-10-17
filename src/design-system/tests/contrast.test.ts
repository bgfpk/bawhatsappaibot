import test from 'node:test';
import assert from 'node:assert/strict';
import { getContrastRatio, passesWcagAA } from '../contrast';

test('Contrast: Dark Theme Normal Text Combinations Pass WCAG 2.2 AA (>= 4.5:1)', () => {
  const darkCanvas = '#0a0c0d';
  const darkSurface1 = '#171b1e';
  const darkSurface2 = '#1d2226';

  const primaryTextDark = '#f2f4f3';
  const secondaryTextDark = '#c4cac7';
  const mutedTextDark = '#9fa8a4';
  const brandDark = '#32cf91';
  const dangerDark = '#ff6b7d';
  const warningDark = '#e5aa48';
  const infoDark = '#5bb9e8';

  // Primary text on canvas
  const primaryOnCanvas = getContrastRatio(primaryTextDark, darkCanvas);
  assert.ok(primaryOnCanvas >= 4.5, `Primary text on canvas contrast ${primaryOnCanvas.toFixed(2)} must be >= 4.5`);

  // Primary text on surfaces
  const primaryOnSurface1 = getContrastRatio(primaryTextDark, darkSurface1);
  assert.ok(primaryOnSurface1 >= 4.5, `Primary text on surface1 contrast ${primaryOnSurface1.toFixed(2)} must be >= 4.5`);

  // Secondary text on canvas
  const secondaryOnCanvas = getContrastRatio(secondaryTextDark, darkCanvas);
  assert.ok(secondaryOnCanvas >= 4.5, `Secondary text on canvas contrast ${secondaryOnCanvas.toFixed(2)} must be >= 4.5`);

  // Muted text on canvas
  const mutedOnCanvas = getContrastRatio(mutedTextDark, darkCanvas);
  assert.ok(mutedOnCanvas >= 4.5, `Muted text on canvas contrast ${mutedOnCanvas.toFixed(2)} must be >= 4.5`);

  // Brand text on canvas
  const brandOnCanvas = getContrastRatio(brandDark, darkCanvas);
  assert.ok(brandOnCanvas >= 4.5, `Brand text on canvas contrast ${brandOnCanvas.toFixed(2)} must be >= 4.5`);

  // Danger text on canvas
  const dangerOnCanvas = getContrastRatio(dangerDark, darkCanvas);
  assert.ok(dangerOnCanvas >= 4.5, `Danger text on canvas contrast ${dangerOnCanvas.toFixed(2)} must be >= 4.5`);

  // Warning text on canvas
  const warningOnCanvas = getContrastRatio(warningDark, darkCanvas);
  assert.ok(warningOnCanvas >= 4.5, `Warning text on canvas contrast ${warningOnCanvas.toFixed(2)} must be >= 4.5`);

  // Info text on canvas
  const infoOnCanvas = getContrastRatio(infoDark, darkCanvas);
  assert.ok(infoOnCanvas >= 4.5, `Info text on canvas contrast ${infoOnCanvas.toFixed(2)} must be >= 4.5`);
});

test('Contrast: Light Theme Normal Text Combinations Pass WCAG 2.2 AA (>= 4.5:1)', () => {
  const lightCanvas = '#f0f2f1';
  const lightSurface1 = '#ffffff';

  const primaryTextLight = '#121614';
  const secondaryTextLight = '#3d4440';
  const mutedTextLight = '#58605b';
  const brandLight = '#12714e';
  const dangerLight = '#b91c1c';

  const primaryOnLight = getContrastRatio(primaryTextLight, lightSurface1);
  assert.ok(primaryOnLight >= 4.5, `Light primary text contrast ${primaryOnLight.toFixed(2)} must be >= 4.5`);

  const secondaryOnLight = getContrastRatio(secondaryTextLight, lightSurface1);
  assert.ok(secondaryOnLight >= 4.5, `Light secondary text contrast ${secondaryOnLight.toFixed(2)} must be >= 4.5`);

  const mutedOnLight = getContrastRatio(mutedTextLight, lightSurface1);
  assert.ok(mutedOnLight >= 4.5, `Light muted text contrast ${mutedOnLight.toFixed(2)} must be >= 4.5`);

  const brandOnLight = getContrastRatio(brandLight, lightSurface1);
  assert.ok(brandOnLight >= 4.5, `Light brand contrast ${brandOnLight.toFixed(2)} must be >= 4.5`);

  const dangerOnLight = getContrastRatio(dangerLight, lightSurface1);
  assert.ok(dangerOnLight >= 4.5, `Light danger contrast ${dangerOnLight.toFixed(2)} must be >= 4.5`);
});

test('Contrast: UI Components (Focus ring, buttons) Pass WCAG 2.2 UI Target (>= 3.0:1)', () => {
  const darkCanvas = '#0a0c0d';
  const focusRingDark = '#32cf91';
  const focusRatio = getContrastRatio(focusRingDark, darkCanvas);
  assert.ok(passesWcagAA(focusRatio, false, true), `Focus ring contrast ${focusRatio.toFixed(2)} must be >= 3.0`);
});
