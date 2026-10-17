import { PUBLIC_SITE_CONFIG } from "@/lib/site-config";

function toJson(data: Record<string, unknown>) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function StructuredData({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: toJson(data) }}
    />
  );
}

export function buildRootGraphSchema() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${PUBLIC_SITE_CONFIG.siteUrl}/#organization`,
        name: "BlackArrow",
        url: PUBLIC_SITE_CONFIG.siteUrl,
        logo: `${PUBLIC_SITE_CONFIG.siteUrl}/brand/black-arrow-icon.png`,
        contactPoint: [
          {
            "@type": "ContactPoint",
            contactType: "sales and support",
            email: PUBLIC_SITE_CONFIG.supportEmail,
          },
        ],
      },
      {
        "@type": "WebSite",
        "@id": `${PUBLIC_SITE_CONFIG.siteUrl}/#website`,
        name: "BlackArrow",
        url: PUBLIC_SITE_CONFIG.siteUrl,
        description:
          "BlackArrow helps businesses automate WhatsApp replies, order capture, customer support, and follow-ups with AI and human handoff controls.",
        publisher: {
          "@id": `${PUBLIC_SITE_CONFIG.siteUrl}/#organization`,
        },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${PUBLIC_SITE_CONFIG.siteUrl}/#software`,
        name: "BlackArrow",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: PUBLIC_SITE_CONFIG.siteUrl,
        description:
          "WhatsApp AI assistant for sales, support, order capture, templates, customer records, and wallet-based usage visibility.",
        publisher: {
          "@id": `${PUBLIC_SITE_CONFIG.siteUrl}/#organization`,
        },
      },
    ],
  };
}

export function buildWebPageSchema(params: {
  path: string;
  name: string;
  description: string;
  type?: "WebPage" | "AboutPage" | "ContactPage" | "CollectionPage";
}) {
  const { path, name, description, type = "WebPage" } = params;
  const canonicalUrl = `${PUBLIC_SITE_CONFIG.siteUrl}${path === "/" ? "" : path}`;
  const webPageId = path === "/" ? `${PUBLIC_SITE_CONFIG.siteUrl}/#webpage` : `${canonicalUrl}#webpage`;

  return {
    "@context": "https://schema.org",
    "@type": type,
    "@id": webPageId,
    url: canonicalUrl,
    name,
    description,
    isPartOf: {
      "@id": `${PUBLIC_SITE_CONFIG.siteUrl}/#website`,
    },
    about: {
      "@id": `${PUBLIC_SITE_CONFIG.siteUrl}/#software`,
    },
    publisher: {
      "@id": `${PUBLIC_SITE_CONFIG.siteUrl}/#organization`,
    },
  };
}

export function buildBreadcrumbSchema(items: Array<{ name: string; url: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => {
      const itemUrl = item.url.startsWith("http")
        ? item.url
        : `${PUBLIC_SITE_CONFIG.siteUrl}${item.url}`;
      return {
        "@type": "ListItem",
        position: index + 1,
        name: item.name,
        item: itemUrl,
      };
    }),
  };
}

export function buildBlogPostingSchema(post: {
  title: string;
  excerpt: string;
  metaDescription?: string;
  publishedAt: string;
  author: string;
  slug: string;
}) {
  const articleUrl = `${PUBLIC_SITE_CONFIG.siteUrl}/blog/${post.slug}`;

  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "@id": `${articleUrl}#article`,
    headline: post.title,
    description: post.metaDescription || post.excerpt,
    url: articleUrl,
    datePublished: post.publishedAt,
    dateModified: post.publishedAt,
    author: {
      "@type": "Organization",
      "@id": `${PUBLIC_SITE_CONFIG.siteUrl}/#organization`,
      name: post.author || "BlackArrow Team",
      url: PUBLIC_SITE_CONFIG.siteUrl,
    },
    publisher: {
      "@type": "Organization",
      "@id": `${PUBLIC_SITE_CONFIG.siteUrl}/#organization`,
      name: "BlackArrow",
      url: PUBLIC_SITE_CONFIG.siteUrl,
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": articleUrl,
    },
  };
}

export function buildTechArticleSchema(page: {
  title: string;
  summary: string;
  slug: string;
}) {
  const articleUrl = `${PUBLIC_SITE_CONFIG.siteUrl}/docs/${page.slug}`;

  return {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    "@id": `${articleUrl}#article`,
    headline: page.title,
    description: page.summary,
    url: articleUrl,
    author: {
      "@type": "Organization",
      "@id": `${PUBLIC_SITE_CONFIG.siteUrl}/#organization`,
      name: "BlackArrow Team",
      url: PUBLIC_SITE_CONFIG.siteUrl,
    },
    publisher: {
      "@type": "Organization",
      "@id": `${PUBLIC_SITE_CONFIG.siteUrl}/#organization`,
      name: "BlackArrow",
      url: PUBLIC_SITE_CONFIG.siteUrl,
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": articleUrl,
    },
  };
}

export function buildPricingOffersSchema(
  plans: Array<{ name: string; price: string | number; description?: string }>,
  priceValidUntil?: string,
) {
  const numericPrices = plans
    .map((plan) => parseFloat(String(plan.price).replace(/[^0-9.]/g, "")))
    .filter((price) => !isNaN(price));

  const lowPrice = numericPrices.length > 0 ? String(Math.min(...numericPrices)) : undefined;
  const highPrice = numericPrices.length > 0 ? String(Math.max(...numericPrices)) : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": `${PUBLIC_SITE_CONFIG.siteUrl}/#software`,
    name: "BlackArrow",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: PUBLIC_SITE_CONFIG.siteUrl,
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "USD",
      ...(lowPrice ? { lowPrice } : {}),
      ...(highPrice ? { highPrice } : {}),
      offerCount: plans.length,
      offers: plans.map((plan) => {
        const numericPrice = String(plan.price).replace(/[^0-9.]/g, "");
        return {
          "@type": "Offer",
          name: `${plan.name} Plan`,
          price: numericPrice,
          priceCurrency: "USD",
          url: `${PUBLIC_SITE_CONFIG.siteUrl}/pricing`,
          ...(priceValidUntil ? { priceValidUntil } : {}),
        };
      }),
    },
  };
}

export function buildContactPageSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "ContactPage",
    "@id": `${PUBLIC_SITE_CONFIG.siteUrl}/contact#webpage`,
    name: "Contact BlackArrow | Sales, Support & Product Assistance",
    description: "Get in touch with BlackArrow for product questions, account setup assistance, and support for WhatsApp AI automation.",
    url: `${PUBLIC_SITE_CONFIG.siteUrl}/contact`,
    isPartOf: {
      "@id": `${PUBLIC_SITE_CONFIG.siteUrl}/#website`,
    },
    mainEntity: {
      "@type": "Organization",
      "@id": `${PUBLIC_SITE_CONFIG.siteUrl}/#organization`,
      name: "BlackArrow",
      url: PUBLIC_SITE_CONFIG.siteUrl,
      contactPoint: [
        {
          "@type": "ContactPoint",
          contactType: "sales and support",
          email: PUBLIC_SITE_CONFIG.supportEmail,
        },
      ],
    },
  };
}

// Deprecated legacy builder aliases maintained for backward compatibility
export function buildOrganizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${PUBLIC_SITE_CONFIG.siteUrl}/#organization`,
    name: "BlackArrow",
    url: PUBLIC_SITE_CONFIG.siteUrl,
    logo: `${PUBLIC_SITE_CONFIG.siteUrl}/brand/black-arrow-icon.png`,
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "sales and support",
        email: PUBLIC_SITE_CONFIG.supportEmail,
      },
    ],
  };
}

export function buildWebsiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${PUBLIC_SITE_CONFIG.siteUrl}/#website`,
    name: "BlackArrow",
    url: PUBLIC_SITE_CONFIG.siteUrl,
    description:
      "BlackArrow helps businesses automate WhatsApp replies, order capture, customer support, and follow-ups with AI and human handoff controls.",
    publisher: {
      "@id": `${PUBLIC_SITE_CONFIG.siteUrl}/#organization`,
    },
  };
}

export function buildSoftwareSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": `${PUBLIC_SITE_CONFIG.siteUrl}/#software`,
    name: "BlackArrow",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: PUBLIC_SITE_CONFIG.siteUrl,
    description:
      "WhatsApp AI assistant for sales, support, order capture, templates, customer records, and wallet-based usage visibility.",
  };
}

