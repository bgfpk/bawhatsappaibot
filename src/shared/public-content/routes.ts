import { BLOG_POSTS, getBlogPath } from "./blog";
import { DOCS_PAGES, getDocsPagePath } from "./docs";
import { normalizePublicPath, PUBLIC_SEO_ROUTES, PUBLIC_SECTION_LINKS } from "./public-seo";
import { SEO_LANDING_PAGES, getSeoLandingPagePath } from "./seo-landing-pages";

export type PublicRouteGroup =
  | "static"
  | "blog"
  | "docs"
  | "seo-landing"
  | "legal"
  | "section-link";

export type PublicRouteMapping = {
  canonicalPath: string;
  group: PublicRouteGroup;
  path: string;
  sitemap: boolean;
};

const LEGAL_ROUTE_PATHS = ["/terms", "/privacy", "/disclaimer"] as const;

const DASHBOARD_ROUTE_EXCLUSIONS = [
  "/global_dashboard",
  "/dashboard",
  "/admin",
  "/api/",
  "/socket.io/",
] as const;

function buildStaticRouteMappings(): PublicRouteMapping[] {
  return PUBLIC_SEO_ROUTES.map((route) => ({
    path: normalizePublicPath(route.path),
    canonicalPath: normalizePublicPath(route.canonicalPath),
    group: LEGAL_ROUTE_PATHS.includes(route.canonicalPath as (typeof LEGAL_ROUTE_PATHS)[number]) ? "legal" : "static",
    sitemap: route.sitemap,
  }));
}

function buildBlogRouteMappings(): PublicRouteMapping[] {
  return BLOG_POSTS.map((post) => ({
    path: getBlogPath(post.slug),
    canonicalPath: getBlogPath(post.slug),
    group: "blog",
    sitemap: true,
  }));
}

function buildDocsRouteMappings(): PublicRouteMapping[] {
  return DOCS_PAGES.map((page) => ({
    path: getDocsPagePath(page.slug),
    canonicalPath: getDocsPagePath(page.slug),
    group: "docs",
    sitemap: true,
  }));
}

function buildSeoLandingRouteMappings(): PublicRouteMapping[] {
  return SEO_LANDING_PAGES.map((page) => ({
    path: getSeoLandingPagePath(page.slug),
    canonicalPath: getSeoLandingPagePath(page.slug),
    group: "seo-landing",
    sitemap: true,
  }));
}

function buildSectionRouteMappings(): PublicRouteMapping[] {
  return PUBLIC_SECTION_LINKS.map((section) => ({
    path: section.href,
    canonicalPath: normalizePublicPath(section.href.split("#")[0] || "/"),
    group: "section-link",
    sitemap: section.sitemap,
  }));
}

export const STATIC_PUBLIC_ROUTE_MAPPINGS = buildStaticRouteMappings();
export const BLOG_ROUTE_MAPPINGS = buildBlogRouteMappings();
export const DOCS_ROUTE_MAPPINGS = buildDocsRouteMappings();
export const SEO_LANDING_ROUTE_MAPPINGS = buildSeoLandingRouteMappings();
export const SECTION_ROUTE_MAPPINGS = buildSectionRouteMappings();
export const LEGAL_ROUTE_MAPPINGS = STATIC_PUBLIC_ROUTE_MAPPINGS.filter((route) => route.group === "legal");
export const DASHBOARD_ROUTE_EXCLUSION_LIST = [...DASHBOARD_ROUTE_EXCLUSIONS];

export const PUBLIC_CANONICAL_ROUTE_MAP = Object.freeze(
  Object.fromEntries(STATIC_PUBLIC_ROUTE_MAPPINGS.map((route) => [route.path, route.canonicalPath])) as Record<string, string>,
);

export const ALL_PUBLIC_ROUTE_MAPPINGS = Object.freeze([
  ...STATIC_PUBLIC_ROUTE_MAPPINGS,
  ...BLOG_ROUTE_MAPPINGS,
  ...DOCS_ROUTE_MAPPINGS,
  ...SEO_LANDING_ROUTE_MAPPINGS,
  ...SECTION_ROUTE_MAPPINGS,
]);

export const PUBLIC_ROUTE_PATHS = Object.freeze(ALL_PUBLIC_ROUTE_MAPPINGS.map((route) => route.path));

export const PUBLIC_SITEMAP_PATHS = Object.freeze(
  Array.from(
    new Set(
      ALL_PUBLIC_ROUTE_MAPPINGS.filter((route) => route.sitemap).map((route) => route.canonicalPath),
    ),
  ),
);

export function isDashboardExcludedRoute(pathname: string) {
  const normalized = normalizePublicPath(pathname);
  return DASHBOARD_ROUTE_EXCLUSIONS.some((blockedPath) => {
    if (blockedPath.endsWith("/")) {
      return normalized.startsWith(blockedPath.slice(0, -1));
    }

    return normalized === blockedPath;
  });
}
