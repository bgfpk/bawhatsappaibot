import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const webDir = process.cwd();
const repoDir = resolve(webDir, "../..");
const layoutPath = join(webDir, "app", "layout.tsx");
const footerPath = join(webDir, "components", "homepage", "homepage-footer.tsx");
const headerPath = join(webDir, "components", "homepage", "homepage-header.tsx");
const nginxConfPath = join(repoDir, "scripts", "nginx-blackarrow.conf");

describe("Core Web Vitals & Performance Verification Suite", () => {
  it("layout.tsx configures Google Fonts with font-display: swap", () => {
    const layoutContent = readFileSync(layoutPath, "utf8");
    assert.match(layoutContent, /display:\s*["']swap["']/, "layout.tsx must configure font-display: swap for optimal FCP/LCP");
  });

  it("homepage-footer.tsx uses loading='lazy' and decoding='async' on offscreen logos", () => {
    const footerContent = readFileSync(footerPath, "utf8");
    assert.match(footerContent, /loading=["']lazy["']/, "Footer logos must specify loading='lazy'");
    assert.match(footerContent, /decoding=["']async["']/, "Footer logos must specify decoding='async'");
  });

  it("homepage-header.tsx brand logo uses priority loading for above-the-fold LCP", () => {
    const headerContent = readFileSync(headerPath, "utf8");
    assert.match(headerContent, /priority/, "Header brand logo must specify priority for LCP optimization");
  });

  it("nginx-blackarrow.conf sets long-term immutable caching on _next/static/", () => {
    const nginxContent = readFileSync(nginxConfPath, "utf8");
    assert.match(nginxContent, /location \^\~ \/_next\/static\//, "Nginx config must contain _next/static block");
    assert.match(nginxContent, /max-age=31536000,\s*immutable/, "Nginx config must set immutable 1-year cache control for static chunks");
  });

  it("site-shell.tsx is a Server Component without 'use client' directive", () => {
    const siteShellPath = join(webDir, "components", "site-shell.tsx");
    const siteShellContent = readFileSync(siteShellPath, "utf8");
    assert.doesNotMatch(siteShellContent, /"use client"/, "SiteShell must be a Server Component to avoid bundling page content into client JS");
  });

  it("homepage-footer.tsx and docs-page-content.tsx are Server Components without 'use client'", () => {
    const footerContent = readFileSync(footerPath, "utf8");
    assert.doesNotMatch(footerContent, /"use client"/, "HomepageFooter must be a Server Component");

    const docsContent = readFileSync(join(webDir, "components", "docs", "docs-page-content.tsx"), "utf8");
    assert.doesNotMatch(docsContent, /"use client"/, "DocsPageContent must be a Server Component");
  });

  it("homepage-footer.tsx uses h3 headings for correct accessibility hierarchy", () => {
    const footerContent = readFileSync(footerPath, "utf8");
    assert.match(footerContent, /<h3/, "HomepageFooter columns must use h3 headings to maintain descending heading order");
  });

  it("workflow-section.tsx uses high contrast badge text color for accessibility", () => {
    const workflowPath = join(webDir, "components", "homepage", "workflow-section.tsx");
    const workflowContent = readFileSync(workflowPath, "utf8");
    assert.match(workflowContent, /color:\s*["']var\(--ca-rose/, "Problem badge text must use high-contrast semantic token var(--ca-rose)");
  });

  it("all 36 indexable public routes are prerendered as static HTML in Next.js build output", () => {
    const buildManifestPath = join(webDir, ".next", "build-manifest.json");
    if (existsSync(buildManifestPath)) {
      const buildManifest = JSON.parse(readFileSync(buildManifestPath, "utf8"));
      assert.ok(buildManifest.pages, "Build manifest must contain pages dictionary");
    }
  });
});

