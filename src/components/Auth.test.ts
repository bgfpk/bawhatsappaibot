import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const authFile = path.resolve(__dirname, "Auth.tsx");
const authContent = fs.readFileSync(authFile, "utf-8");

test("Auth component strictly respects active theme and avoids hardcoded dark-only colors", () => {
  // 1. BrandLogo must not be hardcoded to dark mode
  assert.doesNotMatch(
    authContent,
    /<BrandLogo\s+isDarkMode\s+imageClassName/i,
    "BrandLogo in Auth.tsx must not pass static boolean true for isDarkMode"
  );
  assert.match(
    authContent,
    /<BrandLogo\s+isDarkMode=\{Boolean\(isDarkMode\)\}/,
    "BrandLogo in Auth.tsx must bind isDarkMode to active state"
  );

  // 2. Auth inputs and containers must use semantic theme variables
  assert.match(
    authContent,
    /bg-\[var\(--ca-surface-1\)\]/,
    "Auth inputs/buttons must use semantic surface tokens"
  );
  assert.match(
    authContent,
    /border-\[var\(--ca-border\)\]/,
    "Auth inputs/dividers must use semantic border tokens"
  );
  assert.match(
    authContent,
    /text-\[var\(--ca-text-primary\)\]/,
    "Auth form headings/inputs must use semantic text tokens"
  );

  // 3. Known dark-only hardcoded classes must not appear in auth form controls
  assert.doesNotMatch(
    authContent,
    /border-gray-700\s+bg-gray-800\s+text-white/,
    "Auth inputs must not use hardcoded dark gray utility classes"
  );
  assert.doesNotMatch(
    authContent,
    /border-white\/10\s+bg-white\/\[0\.03\]/,
    "Auth legal container must not use hardcoded dark surface classes"
  );
});
