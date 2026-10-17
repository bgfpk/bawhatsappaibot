import assert from "node:assert/strict";
import test from "node:test";

import { getSitemapRoutes } from "./public-seo";
import {
  BLOG_ROUTE_MAPPINGS,
  DASHBOARD_ROUTE_EXCLUSION_LIST,
  DOCS_ROUTE_MAPPINGS,
  PUBLIC_CANONICAL_ROUTE_MAP,
  PUBLIC_ROUTE_PATHS,
  PUBLIC_SITEMAP_PATHS,
  SEO_LANDING_ROUTE_MAPPINGS,
  isDashboardExcludedRoute,
} from "./routes";

test("public route list contains key marketing and legal pages", () => {
  const expectedPaths = ["/", "/features", "/pricing", "/docs", "/blog", "/contact", "/terms", "/privacy", "/disclaimer"];

  for (const path of expectedPaths) {
    assert.ok(PUBLIC_ROUTE_PATHS.includes(path), `expected ${path} in public route paths`);
  }
});

test("canonical docs alias preserves documentation to docs mapping", () => {
  assert.equal(PUBLIC_CANONICAL_ROUTE_MAP["/documentation"], "/docs");
});

test("blog docs and SEO landing mappings are generated for future public-site reuse", () => {
  assert.ok(BLOG_ROUTE_MAPPINGS.some((route) => route.path === "/blog/how-whatsapp-automation-helps-small-businesses-reply-faster"));
  assert.ok(DOCS_ROUTE_MAPPINGS.some((route) => route.path === "/docs/getting-started"));
  assert.ok(SEO_LANDING_ROUTE_MAPPINGS.some((route) => route.path === "/whatsapp-automation"));
});

test("public sitemap paths exclude dashboard and private prefixes", () => {
  for (const blockedPath of DASHBOARD_ROUTE_EXCLUSION_LIST) {
    assert.ok(!PUBLIC_SITEMAP_PATHS.some((path) => path === blockedPath || path.startsWith(blockedPath)));
  }

  assert.ok(isDashboardExcludedRoute("/global_dashboard"));
  assert.ok(isDashboardExcludedRoute("/api/auth/google/callback"));
  assert.ok(!isDashboardExcludedRoute("/pricing"));
});

test("shared sitemap path list stays aligned with current SEO sitemap generation", () => {
  const currentSitemapPaths = Array.from(new Set(getSitemapRoutes().map((route) => route.canonicalPath))).sort();
  const sharedSitemapPaths = [...PUBLIC_SITEMAP_PATHS].sort();

  assert.deepEqual(sharedSitemapPaths, currentSitemapPaths);
});
