import type { MetadataRoute } from "next";

import { DASHBOARD_ROUTE_EXCLUSION_LIST, PUBLIC_SITE_ORIGIN } from "@/lib/public-content";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: DASHBOARD_ROUTE_EXCLUSION_LIST,
    },
    sitemap: `${PUBLIC_SITE_ORIGIN}/sitemap.xml`,
  };
}
