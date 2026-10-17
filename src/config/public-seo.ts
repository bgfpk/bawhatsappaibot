import { BLOG_POSTS, getBlogPath, getBlogPostFromPath, isBlogPath } from "../content/blog-posts.ts";
import { DOCS_PAGES, getDocsPageFromPath, getDocsPagePath, isDocsDetailPath } from "../content/docs-pages.ts";
import {
  SEO_LANDING_PAGES,
  getSeoLandingPageFromPath,
  getSeoLandingPagePath,
  isSeoLandingPagePath,
} from "../content/seo-landing-pages.ts";

export const PUBLIC_SITE_ORIGIN = "https://blackarrow-source.offline.invalid";

export type PublicPageKey =
  | "home"
  | "features"
  | "pricing"
  | "integrations"
  | "about"
  | "contact"
  | "documentation"
  | "tos"
  | "privacy"
  | "disclaimer"
  | "blog"
  | "solution";

export type PublicSeoRoute = {
  key: PublicPageKey;
  path: string;
  canonicalPath: string;
  label: string;
  title: string;
  description: string;
  keywords: string[];
  sitemap: boolean;
  priority: number;
  changeFrequency: "daily" | "weekly" | "monthly";
};

export type PublicSeoMetadata = {
  title: string;
  description: string;
  keywords: string[];
  canonicalPath: string;
  canonicalUrl: string;
  label: string;
  robots: string;
  ogType: "website" | "article";
  structuredData: Record<string, unknown>;
  publishedTime?: string;
  modifiedTime?: string;
};

export type PublicSectionLink = {
  id: string;
  href: string;
  label: string;
  sitemap: false;
};

export const PUBLIC_SEO_ROUTES: PublicSeoRoute[] = [
  {
    key: "home",
    path: "/",
    canonicalPath: "/",
    label: "Home",
    title: "BlackArrow | WhatsApp AI Automation for Sales, Orders, and Support",
    description:
      "BlackArrow helps businesses automate WhatsApp customer replies, voice notes, product guidance, orders, and follow-ups from one client-facing dashboard.",
    keywords: ["BlackArrow", "WhatsApp AI", "WhatsApp automation", "AI customer support", "WhatsApp sales automation"],
    sitemap: true,
    priority: 1,
    changeFrequency: "weekly",
  },
  {
    key: "features",
    path: "/features",
    canonicalPath: "/features",
    label: "Features",
    title: "BlackArrow Features | WhatsApp AI, Orders, Voice, Billing, and Templates",
    description:
      "Explore BlackArrow features for WhatsApp AI replies, products, orders, customer memory, media templates, wallet billing, and courier-ready workflows.",
    keywords: ["BlackArrow features", "WhatsApp AI features", "WhatsApp order automation", "voice note automation"],
    sitemap: true,
    priority: 0.9,
    changeFrequency: "weekly",
  },
  {
    key: "pricing",
    path: "/pricing",
    canonicalPath: "/pricing",
    label: "Pricing",
    title: "BlackArrow Pricing | WhatsApp AI Plans, Wallet Billing, and Add-ons",
    description:
      "View BlackArrow pricing for Starter, Growth, and Pro plans, plus wallet-based AI text, voice, image, and add-on pricing.",
    keywords: ["BlackArrow pricing", "WhatsApp AI pricing", "wallet billing", "AI reply pricing"],
    sitemap: true,
    priority: 0.9,
    changeFrequency: "weekly",
  },
  {
    key: "integrations",
    path: "/integrations",
    canonicalPath: "/integrations",
    label: "Integrations",
    title: "BlackArrow Integrations | E-Commerce, Courier Lookups, and Webhooks",
    description:
      "Explore BlackArrow integrations for WooCommerce catalog context, WordPress knowledge sync, custom webhooks, and configured courier tracking lookups.",
    keywords: ["BlackArrow integrations", "WooCommerce WhatsApp integration", "WordPress WhatsApp sync", "courier integrations"],
    sitemap: true,
    priority: 0.85,
    changeFrequency: "weekly",
  },
  {
    key: "about",
    path: "/about",
    canonicalPath: "/about",
    label: "About",
    title: "About BlackArrow | WhatsApp AI Commerce Automation",
    description:
      "Learn what BlackArrow is building for WhatsApp commerce automation, client operations, order workflows, and practical AI support.",
    keywords: ["about BlackArrow", "WhatsApp commerce automation", "BlackArrow company"],
    sitemap: true,
    priority: 0.7,
    changeFrequency: "monthly",
  },
  {
    key: "contact",
    path: "/contact",
    canonicalPath: "/contact",
    label: "Contact Sales",
    title: "Contact BlackArrow | Sales and Setup Help",
    description:
      "Contact BlackArrow for setup guidance, plan questions, and WhatsApp AI automation support for your business.",
    keywords: ["contact BlackArrow", "WhatsApp AI support", "BlackArrow sales"],
    sitemap: true,
    priority: 0.7,
    changeFrequency: "monthly",
  },
  {
    key: "documentation",
    path: "/docs",
    canonicalPath: "/docs",
    label: "Documentation",
    title: "BlackArrow Docs | Client Setup, WhatsApp Connection, Billing, and Operations",
    description:
      "Read BlackArrow documentation for account setup, Instance Hub, WhatsApp connection, Intelligence, products, templates, reply modes, and billing.",
    keywords: ["BlackArrow docs", "WhatsApp AI documentation", "client setup guide"],
    sitemap: true,
    priority: 0.8,
    changeFrequency: "weekly",
  },
  {
    key: "documentation",
    path: "/documentation",
    canonicalPath: "/docs",
    label: "Documentation",
    title: "BlackArrow Docs | Client Setup, WhatsApp Connection, Billing, and Operations",
    description:
      "Read BlackArrow documentation for account setup, Instance Hub, WhatsApp connection, Intelligence, products, templates, reply modes, and billing.",
    keywords: ["BlackArrow docs", "WhatsApp AI documentation", "client setup guide"],
    sitemap: false,
    priority: 0.2,
    changeFrequency: "monthly",
  },
  {
    key: "tos",
    path: "/terms",
    canonicalPath: "/terms",
    label: "Terms of Service",
    title: "BlackArrow Terms of Service",
    description:
      "Review the BlackArrow Terms of Service for platform access, billing, acceptable use, courier integrations, and service availability.",
    keywords: ["BlackArrow terms", "terms of service", "WhatsApp automation terms"],
    sitemap: true,
    priority: 0.5,
    changeFrequency: "monthly",
  },
  {
    key: "privacy",
    path: "/privacy",
    canonicalPath: "/privacy",
    label: "Privacy Policy",
    title: "BlackArrow Privacy Policy",
    description:
      "Review the BlackArrow Privacy Policy covering account data, connected WhatsApp data, courier credentials, and customer information handling.",
    keywords: ["BlackArrow privacy", "privacy policy", "customer data handling"],
    sitemap: true,
    priority: 0.5,
    changeFrequency: "monthly",
  },
  {
    key: "disclaimer",
    path: "/disclaimer",
    canonicalPath: "/disclaimer",
    label: "Disclaimer",
    title: "BlackArrow Disclaimer",
    description:
      "Read the BlackArrow disclaimer covering WhatsApp automation use, AI limitations, third-party services, and operational responsibility.",
    keywords: ["BlackArrow disclaimer", "AI disclaimer", "WhatsApp automation disclaimer"],
    sitemap: true,
    priority: 0.5,
    changeFrequency: "monthly",
  },
  {
    key: "blog",
    path: "/blog",
    canonicalPath: "/blog",
    label: "Blog",
    title: "BlackArrow Blog | WhatsApp Automation, Ecommerce, and Support Guides",
    description:
      "Read practical BlackArrow articles about WhatsApp automation, ecommerce order capture, voice notes, and customer support workflows.",
    keywords: ["BlackArrow blog", "WhatsApp automation blog", "ecommerce WhatsApp", "customer support automation"],
    sitemap: true,
    priority: 0.8,
    changeFrequency: "weekly",
  },
];

export const PUBLIC_SECTION_LINKS: PublicSectionLink[] = [
  { id: "features", href: "/#features", label: "Features section", sitemap: false },
  { id: "integrations", href: "/#integrations", label: "Integrations section", sitemap: false },
];

const PUBLIC_ROUTE_LOOKUP = new Map(
  PUBLIC_SEO_ROUTES.map((route) => [normalizePublicPath(route.path), route]),
);

export function normalizePublicPath(pathname: string) {
  const trimmed = pathname.trim();
  if (!trimmed || trimmed === "/") return "/";
  return `/${trimmed.replace(/^\/+|\/+$/g, "").toLowerCase()}`;
}

export function getPublicSeoRoute(pathname: string) {
  return PUBLIC_ROUTE_LOOKUP.get(normalizePublicPath(pathname)) || null;
}

export function getPublicPageFromLocation(pathname: string, hash = ""): PublicPageKey {
  const route = getPublicSeoRoute(pathname);
  if (route) return route.key;
  if (isBlogPath(pathname)) return "blog";
  if (isSeoLandingPagePath(pathname)) return "solution";
  if (isDocsDetailPath(pathname)) return "documentation";

  const normalizedHash = hash.toLowerCase();
  if (normalizedHash === "#features" || normalizedHash === "#integrations") return "home";
  return "home";
}

export function isPublicAuthLocation(pathname: string, hash = "") {
  return getPublicSeoRoute(pathname) !== null || isBlogPath(pathname) || isSeoLandingPagePath(pathname) || isDocsDetailPath(pathname) || ["#features", "#integrations"].includes(hash.toLowerCase());
}

export function buildCanonicalUrl(pathname: string) {
  if (isBlogPath(pathname) || isSeoLandingPagePath(pathname) || isDocsDetailPath(pathname)) {
    const normalized = normalizePublicPath(pathname);
    return `${PUBLIC_SITE_ORIGIN}${normalized === "/" ? "" : normalized}`;
  }
  const route = getPublicSeoRoute(pathname);
  const canonicalPath = route?.canonicalPath || normalizePublicPath(pathname);
  return `${PUBLIC_SITE_ORIGIN}${canonicalPath === "/" ? "" : canonicalPath}`;
}

type SitemapEntry = {
  canonicalPath: string;
  changeFrequency: "daily" | "weekly" | "monthly";
  priority: number;
  lastModified?: string;
};

export function getSitemapRoutes(): SitemapEntry[] {
  const staticRoutes = PUBLIC_SEO_ROUTES.filter((route) => route.sitemap).map((route) => ({
    canonicalPath: route.canonicalPath,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  const blogRoutes = BLOG_POSTS.map((post) => ({
    canonicalPath: getBlogPath(post.slug),
    changeFrequency: "monthly" as const,
    priority: 0.7,
    lastModified: post.updatedAt || post.publishedAt,
  }));

  const solutionRoutes = SEO_LANDING_PAGES.map((page) => ({
    canonicalPath: getSeoLandingPagePath(page.slug),
    changeFrequency: "monthly" as const,
    priority: 0.75,
  }));

  const docsRoutes = DOCS_PAGES.map((page) => ({
    canonicalPath: getDocsPagePath(page.slug),
    changeFrequency: "monthly" as const,
    priority: 0.72,
  }));

  return [...staticRoutes, ...blogRoutes, ...solutionRoutes, ...docsRoutes];
}

export function buildSitemapXml(lastModified = new Date()) {
  const urls = getSitemapRoutes()
    .map(
      (route) => `  <url>
    <loc>${buildCanonicalUrl(route.canonicalPath)}</loc>
    <lastmod>${new Date(route.lastModified || lastModified).toISOString()}</lastmod>
    <changefreq>${route.changeFrequency}</changefreq>
    <priority>${route.priority.toFixed(1)}</priority>
  </url>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

export function buildRobotsTxt() {
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/",
    "Disallow: /global_dashboard",
    "Disallow: /socket.io/",
    "Disallow: /admin",
    "",
    `Sitemap: ${PUBLIC_SITE_ORIGIN}/sitemap.xml`,
    "",
  ].join("\n");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function replaceTag(html: string, pattern: RegExp, replacement: string) {
  return pattern.test(html) ? html.replace(pattern, replacement) : html;
}

export function buildPublicStructuredData(route: PublicSeoRoute) {
  const canonicalUrl = buildCanonicalUrl(route.canonicalPath);
  const breadcrumbItems = [
    {
      "@type": "ListItem",
      position: 1,
      name: "Home",
      item: PUBLIC_SITE_ORIGIN,
    },
    ...(route.canonicalPath !== "/"
      ? [
          {
            "@type": "ListItem",
            position: 2,
            name: route.label,
            item: canonicalUrl,
          },
        ]
      : []),
  ];

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: "BlackArrow",
        url: PUBLIC_SITE_ORIGIN,
        logo: `${PUBLIC_SITE_ORIGIN}/black-arrow-icon.png`,
      },
      {
        "@type": "WebSite",
        name: "BlackArrow",
        url: PUBLIC_SITE_ORIGIN,
        description: PUBLIC_SEO_ROUTES[0].description,
      },
      {
        "@type": "SoftwareApplication",
        name: "BlackArrow",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: canonicalUrl,
        description: route.description,
        offers: {
          "@type": "Offer",
          price: "25",
          priceCurrency: "USD",
        },
      },
      {
        "@type": "WebPage",
        name: route.title,
        description: route.description,
        url: canonicalUrl,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: breadcrumbItems,
      },
    ],
  };
}

function buildBlogLandingStructuredData() {
  const canonicalUrl = buildCanonicalUrl("/blog");
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: "BlackArrow",
        url: PUBLIC_SITE_ORIGIN,
        logo: `${PUBLIC_SITE_ORIGIN}/black-arrow-icon.png`,
      },
      {
        "@type": "WebSite",
        name: "BlackArrow",
        url: PUBLIC_SITE_ORIGIN,
        description: PUBLIC_SEO_ROUTES[0].description,
      },
      {
        "@type": "Blog",
        name: "BlackArrow Blog",
        url: canonicalUrl,
        description: "Practical WhatsApp automation, ecommerce, and support workflow articles.",
      },
      {
        "@type": "CollectionPage",
        name: "BlackArrow Blog",
        description: "Practical guides for WhatsApp automation, ecommerce workflows, and customer support.",
        url: canonicalUrl,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: PUBLIC_SITE_ORIGIN,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Blog",
            item: canonicalUrl,
          },
        ],
      },
    ],
  };
}

function buildBlogPostStructuredData(pathname: string) {
  const post = getBlogPostFromPath(pathname);
  if (!post) return buildBlogLandingStructuredData();

  const canonicalUrl = buildCanonicalUrl(pathname);
  const blogUrl = buildCanonicalUrl("/blog");

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: "BlackArrow",
        url: PUBLIC_SITE_ORIGIN,
        logo: `${PUBLIC_SITE_ORIGIN}/black-arrow-icon.png`,
      },
      {
        "@type": "WebSite",
        name: "BlackArrow",
        url: PUBLIC_SITE_ORIGIN,
        description: PUBLIC_SEO_ROUTES[0].description,
      },
      {
        "@type": "Blog",
        name: "BlackArrow Blog",
        url: blogUrl,
      },
      {
        "@type": "Article",
        headline: post.title,
        description: post.metaDescription,
        author: {
          "@type": "Organization",
          name: post.author,
        },
        publisher: {
          "@type": "Organization",
          name: "BlackArrow",
          logo: {
            "@type": "ImageObject",
            url: `${PUBLIC_SITE_ORIGIN}/black-arrow-icon.png`,
          },
        },
        mainEntityOfPage: canonicalUrl,
        datePublished: post.publishedAt,
        ...(post.updatedAt ? { dateModified: post.updatedAt } : {}),
        articleSection: post.category,
        keywords: post.tags.join(", "),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: PUBLIC_SITE_ORIGIN,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Blog",
            item: blogUrl,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: post.title,
            item: canonicalUrl,
          },
        ],
      },
    ],
  };
}

function buildSeoLandingStructuredData(pathname: string) {
  const page = getSeoLandingPageFromPath(pathname);
  if (!page) return buildPublicStructuredData(getPublicSeoRoute("/")!);

  const canonicalUrl = buildCanonicalUrl(pathname);

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: "BlackArrow",
        url: PUBLIC_SITE_ORIGIN,
        logo: `${PUBLIC_SITE_ORIGIN}/black-arrow-icon.png`,
      },
      {
        "@type": "WebSite",
        name: "BlackArrow",
        url: PUBLIC_SITE_ORIGIN,
        description: PUBLIC_SEO_ROUTES[0].description,
      },
      {
        "@type": "WebPage",
        name: page.metaTitle,
        description: page.metaDescription,
        url: canonicalUrl,
        keywords: [page.primaryKeyword, ...page.secondaryKeywords].join(", "),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: PUBLIC_SITE_ORIGIN,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: page.title,
            item: canonicalUrl,
          },
        ],
      },
    ],
  };
}

function buildDocsStructuredData(pathname: string) {
  const page = getDocsPageFromPath(pathname);
  if (!page) return buildPublicStructuredData(getPublicSeoRoute("/docs")!);
  const canonicalUrl = buildCanonicalUrl(pathname);

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: "BlackArrow",
        url: PUBLIC_SITE_ORIGIN,
        logo: `${PUBLIC_SITE_ORIGIN}/black-arrow-icon.png`,
      },
      {
        "@type": "WebSite",
        name: "BlackArrow",
        url: PUBLIC_SITE_ORIGIN,
        description: PUBLIC_SEO_ROUTES[0].description,
      },
      {
        "@type": "TechArticle",
        headline: page.title,
        description: page.metaDescription,
        mainEntityOfPage: canonicalUrl,
        url: canonicalUrl,
        about: page.shortLabel,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: PUBLIC_SITE_ORIGIN,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Documentation",
            item: buildCanonicalUrl("/docs"),
          },
          {
            "@type": "ListItem",
            position: 3,
            name: page.title,
            item: canonicalUrl,
          },
        ],
      },
    ],
  };
}

export function resolvePublicSeoMetadata(pathname: string): PublicSeoMetadata {
  const route = getPublicSeoRoute(pathname);
  if (route?.key === "blog") {
    const canonicalUrl = buildCanonicalUrl("/blog");
    return {
      title: route.title,
      description: route.description,
      keywords: route.keywords,
      canonicalPath: "/blog",
      canonicalUrl,
      label: route.label,
      robots: "index,follow",
      ogType: "website",
      structuredData: buildBlogLandingStructuredData(),
    };
  }

  if (route) {
    const canonicalUrl = buildCanonicalUrl(route.canonicalPath);
    return {
      title: route.title,
      description: route.description,
      keywords: route.keywords,
      canonicalPath: route.canonicalPath,
      canonicalUrl,
      label: route.label,
      robots: "index,follow",
      ogType: "website",
      structuredData: buildPublicStructuredData(route),
    };
  }

  const blogPost = getBlogPostFromPath(pathname);
  if (blogPost) {
    const canonicalPath = getBlogPath(blogPost.slug);
    const canonicalUrl = buildCanonicalUrl(canonicalPath);
    return {
      title: blogPost.metaTitle,
      description: blogPost.metaDescription,
      keywords: [...blogPost.tags, blogPost.category, "BlackArrow blog"],
      canonicalPath,
      canonicalUrl,
      label: blogPost.title,
      robots: "index,follow",
      ogType: "article",
      structuredData: buildBlogPostStructuredData(canonicalPath),
      publishedTime: blogPost.publishedAt,
      modifiedTime: blogPost.updatedAt || blogPost.publishedAt,
    };
  }

  const landingPage = getSeoLandingPageFromPath(pathname);
  if (landingPage) {
    const canonicalPath = getSeoLandingPagePath(landingPage.slug);
    const canonicalUrl = buildCanonicalUrl(canonicalPath);
    return {
      title: landingPage.metaTitle,
      description: landingPage.metaDescription,
      keywords: [landingPage.primaryKeyword, ...landingPage.secondaryKeywords, "BlackArrow"],
      canonicalPath,
      canonicalUrl,
      label: landingPage.title,
      robots: "index,follow",
      ogType: "website",
      structuredData: buildSeoLandingStructuredData(canonicalPath),
    };
  }

  const docsPage = getDocsPageFromPath(pathname);
  if (docsPage) {
    const canonicalPath = getDocsPagePath(docsPage.slug);
    const canonicalUrl = buildCanonicalUrl(canonicalPath);
    return {
      title: docsPage.metaTitle,
      description: docsPage.metaDescription,
      keywords: [docsPage.title, docsPage.shortLabel, "BlackArrow docs", "WhatsApp AI documentation"],
      canonicalPath,
      canonicalUrl,
      label: docsPage.title,
      robots: "index,follow",
      ogType: "article",
      structuredData: buildDocsStructuredData(canonicalPath),
    };
  }

  const homeRoute = getPublicSeoRoute("/")!;
  const canonicalUrl = buildCanonicalUrl("/");
  return {
    title: homeRoute.title,
    description: homeRoute.description,
    keywords: homeRoute.keywords,
    canonicalPath: "/",
    canonicalUrl,
    label: homeRoute.label,
    robots: "index,follow",
    ogType: "website",
    structuredData: buildPublicStructuredData(homeRoute),
  };
}

export function injectPublicSeoIntoHtml(html: string, pathname: string) {
  const metadata = resolvePublicSeoMetadata(pathname);
  const keywords = escapeHtml(metadata.keywords.join(", "));
  const title = escapeHtml(metadata.title);
  const description = escapeHtml(metadata.description);
  const canonicalUrl = metadata.canonicalUrl;
  const structuredData = JSON.stringify(metadata.structuredData).replace(/</g, "\\u003c");

  let nextHtml = html;
  nextHtml = replaceTag(nextHtml, /<title>.*?<\/title>/i, `<title>${title}</title>`);
  nextHtml = replaceTag(nextHtml, /<meta\s+name="description"\s+content=".*?"\s*\/?>/i, `<meta name="description" content="${description}" />`);
  nextHtml = replaceTag(nextHtml, /<meta\s+name="robots"\s+content=".*?"\s*\/?>/i, `<meta name="robots" content="${metadata.robots}" />`);
  nextHtml = replaceTag(nextHtml, /<meta\s+name="keywords"\s+content=".*?"\s*\/?>/i, `<meta name="keywords" content="${keywords}" />`);
  nextHtml = replaceTag(nextHtml, /<meta\s+property="og:type"\s+content=".*?"\s*\/?>/i, `<meta property="og:type" content="${metadata.ogType}" />`);
  nextHtml = replaceTag(nextHtml, /<meta\s+property="og:title"\s+content=".*?"\s*\/?>/i, `<meta property="og:title" content="${title}" />`);
  nextHtml = replaceTag(nextHtml, /<meta\s+property="og:description"\s+content=".*?"\s*\/?>/i, `<meta property="og:description" content="${description}" />`);
  nextHtml = replaceTag(nextHtml, /<meta\s+property="og:url"\s+content=".*?"\s*\/?>/i, `<meta property="og:url" content="${canonicalUrl}" />`);
  nextHtml = replaceTag(nextHtml, /<meta\s+name="twitter:title"\s+content=".*?"\s*\/?>/i, `<meta name="twitter:title" content="${title}" />`);
  nextHtml = replaceTag(nextHtml, /<meta\s+name="twitter:description"\s+content=".*?"\s*\/?>/i, `<meta name="twitter:description" content="${description}" />`);
  nextHtml = replaceTag(nextHtml, /<link\s+rel="canonical"\s+href=".*?"\s*\/?>/i, `<link rel="canonical" href="${canonicalUrl}" />`);
  nextHtml = replaceTag(
    nextHtml,
    /<meta\s+property="article:published_time"\s+content=".*?"\s*\/?>/i,
    metadata.publishedTime ? `<meta property="article:published_time" content="${metadata.publishedTime}" />` : "",
  );
  nextHtml = replaceTag(
    nextHtml,
    /<meta\s+property="article:modified_time"\s+content=".*?"\s*\/?>/i,
    metadata.modifiedTime ? `<meta property="article:modified_time" content="${metadata.modifiedTime}" />` : "",
  );

  if (!/meta\s+name="keywords"/i.test(nextHtml)) {
    nextHtml = nextHtml.replace("</head>", `    <meta name="keywords" content="${keywords}" />\n</head>`);
  }

  if (!/twitter:title/i.test(nextHtml) || !/twitter:description/i.test(nextHtml)) {
    nextHtml = nextHtml.replace(
      "</head>",
      `    <meta name="twitter:title" content="${title}" />\n    <meta name="twitter:description" content="${description}" />\n</head>`,
    );
  }

  if (!/article:published_time/i.test(nextHtml) && metadata.publishedTime) {
    nextHtml = nextHtml.replace(
      "</head>",
      `    <meta property="article:published_time" content="${metadata.publishedTime}" />\n</head>`,
    );
  }

  if (!/article:modified_time/i.test(nextHtml) && metadata.modifiedTime) {
    nextHtml = nextHtml.replace(
      "</head>",
      `    <meta property="article:modified_time" content="${metadata.modifiedTime}" />\n</head>`,
    );
  }

  nextHtml = nextHtml.replace(
    "</head>",
    `    <script type="application/ld+json" data-blackarrow-seo="public-page">${structuredData}</script>\n</head>`,
  );

  return nextHtml;
}
