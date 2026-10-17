import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");

test("M1.2 Website Proof - /design-system-preview route configuration & metadata", async () => {
  const pagePath = path.join(webRoot, "app", "design-system-preview", "page.tsx");
  assert.ok(fs.existsSync(pagePath), "app/design-system-preview/page.tsx must exist");

  const pageContent = fs.readFileSync(pagePath, "utf-8");
  assert.ok(pageContent.includes("robots: {"), "page.tsx must configure robots metadata");
  assert.ok(pageContent.includes("index: false"), "robots metadata must specify index: false");
  assert.ok(pageContent.includes("follow: false"), "robots metadata must specify follow: false");
});

test("M1.2 Website Proof - route exclusion from sitemap.ts", async () => {
  const sitemapPath = path.join(webRoot, "app", "sitemap.ts");
  assert.ok(fs.existsSync(sitemapPath), "app/sitemap.ts must exist");

  const sitemapContent = fs.readFileSync(sitemapPath, "utf-8");
  assert.ok(!sitemapContent.includes("design-system-preview"), "/design-system-preview must NOT be in sitemap.ts");
});

test("M1.2 Website Proof - required primitive component files existence", async () => {
  const requiredPrimitives = [
    "button.tsx",
    "input.tsx",
    "textarea.tsx",
    "select.tsx",
    "checkbox.tsx",
    "radio-group.tsx",
    "switch.tsx",
    "badge.tsx",
    "tabs.tsx",
    "card.tsx",
    "dropdown-menu.tsx",
    "dialog.tsx",
    "sheet.tsx",
    "tooltip.tsx",
    "toast.tsx",
    "alert.tsx",
    "skeleton.tsx",
    "progress.tsx",
    "table.tsx",
    "status-states.tsx",
  ];

  const uiDir = path.join(webRoot, "components", "ui");
  for (const file of requiredPrimitives) {
    const filePath = path.join(uiDir, file);
    assert.ok(fs.existsSync(filePath), `Primitive component ${file} must exist in components/ui/`);
  }
});

test("M1.2 Website Proof - homepage file integrity", async () => {
  const homePagePath = path.join(webRoot, "app", "page.tsx");
  assert.ok(fs.existsSync(homePagePath), "app/page.tsx must exist");
});
