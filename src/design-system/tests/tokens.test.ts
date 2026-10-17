import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { COLOR_TOKENS, SPACING_SCALE, RADIUS_SCALE, Z_INDEX } from '../tokens';

test('Tokens: CSS file defines all required tokens', () => {
  const cssPath = path.join(process.cwd(), 'src', 'design-system', 'tokens.css');
  assert.ok(fs.existsSync(cssPath), 'tokens.css file must exist');

  const cssContent = fs.readFileSync(cssPath, 'utf8');

  const requiredCssVars = [
    '--ca-canvas-0',
    '--ca-surface-1',
    '--ca-surface-elevated',
    '--ca-overlay',
    '--ca-border-subtle',
    '--ca-border-default',
    '--ca-border-strong',
    '--ca-text-primary',
    '--ca-text-secondary',
    '--ca-text-muted',
    '--ca-text-inverse',
    '--ca-brand',
    '--ca-focus-ring',
    '--ca-success',
    '--ca-warning',
    '--ca-danger',
    '--ca-info',
    '--ca-disabled-bg',
    '--ca-disabled-fg',
    '--ca-selection-bg',
    '--ca-skeleton-bg',
  ];

  for (const varName of requiredCssVars) {
    assert.ok(cssContent.includes(varName), `tokens.css must define ${varName}`);
  }
});

test('Tokens: COLOR_TOKENS map maps every token to CSS variable', () => {
  for (const [key, val] of Object.entries(COLOR_TOKENS)) {
    assert.ok(typeof val === 'string' && val.startsWith('var(--ca-'), `Token ${key} must resolve to a CSS variable`);
  }
});

test('Tokens: Z-index ordering is strictly ascending', () => {
  assert.ok(Z_INDEX.base < Z_INDEX.sticky, 'base < sticky');
  assert.ok(Z_INDEX.sticky < Z_INDEX.header, 'sticky < header');
  assert.ok(Z_INDEX.header < Z_INDEX.dropdown, 'header < dropdown');
  assert.ok(Z_INDEX.dropdown < Z_INDEX.popover, 'dropdown < popover');
  assert.ok(Z_INDEX.popover < Z_INDEX.drawer, 'popover < drawer');
  assert.ok(Z_INDEX.drawer < Z_INDEX.modal, 'drawer < modal');
  assert.ok(Z_INDEX.modal < Z_INDEX.toast, 'modal < toast');
  assert.ok(Z_INDEX.toast < Z_INDEX.alert, 'toast < alert');
});

test('Tokens: Spacing and radius scales are non-empty strings', () => {
  for (const [k, v] of Object.entries(SPACING_SCALE)) {
    assert.ok(v, `Spacing key ${k} must be non-empty`);
  }
  for (const [k, v] of Object.entries(RADIUS_SCALE)) {
    assert.ok(v, `Radius key ${k} must be non-empty`);
  }
});

/* ==========================================
 * REAL CSS TOKEN COLLISION & GRAPH PARSER
 * ========================================== */

test('Tokens: Real CSS Token Collision Parser & Inheritance Graph', () => {
  const indexCssPath = path.join(process.cwd(), 'src', 'index.css');
  assert.ok(fs.existsSync(indexCssPath), 'index.css must exist');
  const indexCssContent = fs.readFileSync(indexCssPath, 'utf8');

  // Extract imports
  const importRegex = /@import\s+['"](.+?)['"];/g;
  const importedFiles: string[] = [];
  let match;
  while ((match = importRegex.exec(indexCssContent)) !== null) {
    importedFiles.push(match[1]);
  }

  assert.ok(importedFiles.length > 0, 'index.css must contain @import declarations');
  
  // Verify import precedence: tokens.css imported after legacy theme files
  const tokensIndex = importedFiles.findIndex((f) => f.includes('tokens.css'));
  assert.ok(tokensIndex !== -1, 'tokens.css must be imported in index.css');

  interface TokenDecl {
    name: string;
    value: string;
    file: string;
    scope: string;
  }

  const allDecls: TokenDecl[] = [];
  const tokensCssMapByScope: Record<string, Set<string>> = {
    root: new Set(),
    light: new Set(),
  };

  for (const relFile of importedFiles) {
    const fullPath = path.resolve('src', relFile);
    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, 'utf8');

    const lightIndex = content.indexOf('[data-theme="light"]');

    const varRegex = /(--ca-[\w-]+)\s*:\s*([^;]+);/g;
    let varMatch;
    while ((varMatch = varRegex.exec(content)) !== null) {
      const name = varMatch[1].trim();
      const val = varMatch[2].trim();
      const scope = lightIndex !== -1 && varMatch.index > lightIndex ? 'light' : 'root';
      
      const decl: TokenDecl = { name, value: val, file: relFile, scope };
      allDecls.push(decl);

      if (relFile.includes('tokens.css')) {
        const scopeSet = tokensCssMapByScope[scope];
        assert.ok(
          !scopeSet.has(name),
          `Canonical token ${name} must be declared exactly once in scope ${scope} within tokens.css`
        );
        scopeSet.add(name);
      }
    }
  }

  // Circular & Undefined Variable Reference Check
  const definedTokens = new Set(allDecls.map((d) => d.name));
  for (const decl of allDecls) {
    const varRefRegex = /var\((--ca-[\w-]+)\)/g;
    let refMatch;
    while ((refMatch = varRefRegex.exec(decl.value)) !== null) {
      const refName = refMatch[1];
      assert.ok(definedTokens.has(refName), `Token ${decl.name} in ${decl.file} references undefined variable ${refName}`);
      assert.notEqual(decl.name, refName, `Token ${decl.name} must not directly reference itself`);
    }
  }
});

/* ==========================================
 * PORTABLE REPOSITORY PATH CHECK
 * ========================================== */

test('Portability: Permanent test files do NOT contain absolute C:\\ or C:/Users/ paths', () => {
  const testDirs = [
    path.join(process.cwd(), 'tests'),
    path.join(process.cwd(), 'src', 'design-system', 'tests'),
  ];

  const banned1 = 'C:' + '/Users/';
  const banned2 = 'C:' + '\\Users\\';

  const testFiles: string[] = [];
  function collectFiles(dir: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        collectFiles(fullPath);
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') || entry.name.endsWith('.mjs'))) {
        testFiles.push(fullPath);
      }
    }
  }

  for (const d of testDirs) collectFiles(d);

  for (const file of testFiles) {
    if (file.endsWith('tokens.test.ts')) continue;
    const content = fs.readFileSync(file, 'utf8');
    assert.ok(
      !content.includes(banned1) && !content.includes(banned2),
      `Test file ${path.relative(process.cwd(), file)} must NOT contain absolute drive path`
    );
  }
});

/* ==========================================
 * HARNESS ISOLATION CHECK
 * ========================================== */

test('Harness Isolation: PrimitiveHarness is not imported by production code', () => {
  const prodDirs = [
    path.join(process.cwd(), 'src', 'app'),
    path.join(process.cwd(), 'src', 'components'),
    path.join(process.cwd(), 'src', 'services'),
  ];

  const prodFiles: string[] = [];
  function collectFiles(dir: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        collectFiles(fullPath);
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
        prodFiles.push(fullPath);
      }
    }
  }

  for (const d of prodDirs) collectFiles(d);

  for (const file of prodFiles) {
    const content = fs.readFileSync(file, 'utf8');
    assert.ok(
      !content.includes('PrimitiveHarness'),
      `Production file ${path.relative(process.cwd(), file)} must NOT import PrimitiveHarness`
    );
    assert.ok(
      !content.includes('axe-core'),
      `Production file ${path.relative(process.cwd(), file)} must NOT reference axe-core`
    );
    assert.ok(
      !content.includes('design-system-harness'),
      `Production file ${path.relative(process.cwd(), file)} must NOT reference harness entry`
    );
  }
});

/* ==========================================
 * PRODUCTION DIST BUNDLE ISOLATION CHECK
 * ========================================== */

test('Production Bundle: dist artifacts contain ZERO test harness code or axe-core', () => {
  const distAssetsDir = path.join(process.cwd(), 'dist', 'assets');
  if (!fs.existsSync(distAssetsDir)) {
    // Skip if dist has not been built yet
    return;
  }

  const jsFiles = fs.readdirSync(distAssetsDir).filter((f) => f.endsWith('.js'));
  for (const jsFile of jsFiles) {
    const content = fs.readFileSync(path.join(distAssetsDir, jsFile), 'utf8');
    assert.ok(
      !content.includes('PrimitiveHarness'),
      `Production JS bundle ${jsFile} must NOT contain PrimitiveHarness`
    );
    assert.ok(
      !content.includes('axe-core'),
      `Production JS bundle ${jsFile} must NOT contain axe-core`
    );
    assert.ok(
      !content.includes('design-system-harness'),
      `Production JS bundle ${jsFile} must NOT contain design-system-harness`
    );
  }
});
