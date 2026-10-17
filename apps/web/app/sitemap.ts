import type { MetadataRoute } from "next";

import { PUBLIC_SITE_ORIGIN, getSitemapRoutes } from "@/lib/public-content";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = getSitemapRoutes();

  return routes.map((route) => ({
    url: `${PUBLIC_SITE_ORIGIN}${route.canonicalPath === "/" ? "" : route.canonicalPath}`,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
    ...(route.lastModified ? { lastModified: new Date(route.lastModified).toISOString() } : {}),
  }));
}
