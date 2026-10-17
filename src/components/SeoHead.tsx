import { useEffect } from "react";
import { PublicSeoMetadata, PublicSeoRoute, PUBLIC_SITE_ORIGIN, buildCanonicalUrl, resolvePublicSeoMetadata } from "../config/public-seo";

type SeoHeadProps = {
  route?: PublicSeoRoute | null;
  metadata?: PublicSeoMetadata | null;
  title?: string;
  description?: string;
  robots?: string;
};

const DEFAULT_TITLE = "BlackArrow | WhatsApp AI Automation";
const DEFAULT_DESCRIPTION =
  "BlackArrow helps businesses automate WhatsApp customer replies, voice notes, products, orders, and follow-ups from one client-facing dashboard.";

function ensureMeta(selector: string, create: () => HTMLMetaElement) {
  let tag = document.head.querySelector<HTMLMetaElement>(selector);
  if (!tag) {
    tag = create();
    tag.dataset.blackarrowSeo = "true";
    document.head.appendChild(tag);
  }
  return tag;
}

function setMetaName(name: string, content: string) {
  const tag = ensureMeta(`meta[name="${name}"]`, () => {
    const meta = document.createElement("meta");
    meta.setAttribute("name", name);
    return meta;
  });
  tag.setAttribute("content", content);
}

function setMetaProperty(property: string, content: string) {
  const tag = ensureMeta(`meta[property="${property}"]`, () => {
    const meta = document.createElement("meta");
    meta.setAttribute("property", property);
    return meta;
  });
  tag.setAttribute("content", content);
}

function setCanonical(href: string) {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    link.dataset.blackarrowSeo = "true";
    document.head.appendChild(link);
  }
  link.setAttribute("href", href);
}

function setStructuredData(id: string, graph: Record<string, unknown>[]) {
  let script = document.head.querySelector<HTMLScriptElement>(`script[data-blackarrow-seo-id="${id}"]`);
  if (!script) {
    script = document.createElement("script");
    script.type = "application/ld+json";
    script.dataset.blackarrowSeo = "true";
    script.dataset.blackarrowSeoId = id;
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify({ "@context": "https://schema.org", "@graph": graph });
}

function buildStructuredData(route: PublicSeoRoute | null, title: string, description: string, canonicalUrl: string) {
  const breadcrumbItems = route
    ? [
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
      ]
    : [];

  return [
    {
      "@type": "Organization",
      name: "BlackArrow",
      url: PUBLIC_SITE_ORIGIN,
      logo: `${PUBLIC_SITE_ORIGIN}/black-arrow-icon.png`,
      sameAs: [],
    },
    {
      "@type": "WebSite",
      name: "BlackArrow",
      url: PUBLIC_SITE_ORIGIN,
      description: DEFAULT_DESCRIPTION,
    },
    {
      "@type": "SoftwareApplication",
      name: "BlackArrow",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: canonicalUrl,
      description,
      offers: {
        "@type": "Offer",
        price: "25",
        priceCurrency: "USD",
      },
    },
    {
      "@type": "WebPage",
      name: title,
      description,
      url: canonicalUrl,
    },
    ...(breadcrumbItems.length
      ? [
          {
            "@type": "BreadcrumbList",
            itemListElement: breadcrumbItems,
          },
        ]
      : []),
  ];
}

export function SeoHead({ route = null, metadata = null, title, description, robots = "index,follow" }: SeoHeadProps) {
  useEffect(() => {
    const resolvedMetadata = metadata || (route ? resolvePublicSeoMetadata(route.canonicalPath) : null);
    const nextTitle = title || resolvedMetadata?.title || route?.title || DEFAULT_TITLE;
    const nextDescription = description || resolvedMetadata?.description || route?.description || DEFAULT_DESCRIPTION;
    const canonicalUrl = resolvedMetadata?.canonicalUrl || buildCanonicalUrl(route?.canonicalPath || "/");
    const keywords = resolvedMetadata?.keywords || route?.keywords || ["BlackArrow", "WhatsApp AI automation"];
    const ogType = resolvedMetadata?.ogType || "website";
    const nextRobots = resolvedMetadata?.robots || robots;

    document.title = nextTitle;
    document.documentElement.lang = "en";

    setMetaName("description", nextDescription);
    setMetaName("keywords", keywords.join(", "));
    setMetaName("robots", nextRobots);

    setMetaProperty("og:type", ogType);
    setMetaProperty("og:site_name", "BlackArrow");
    setMetaProperty("og:title", nextTitle);
    setMetaProperty("og:description", nextDescription);
    setMetaProperty("og:url", canonicalUrl);

    setMetaName("twitter:card", "summary_large_image");
    setMetaName("twitter:title", nextTitle);
    setMetaName("twitter:description", nextDescription);

    if (resolvedMetadata?.publishedTime) {
      setMetaProperty("article:published_time", resolvedMetadata.publishedTime);
    }

    if (resolvedMetadata?.modifiedTime) {
      setMetaProperty("article:modified_time", resolvedMetadata.modifiedTime);
    }

    setCanonical(canonicalUrl);
    setStructuredData(
      "public-page",
      resolvedMetadata?.structuredData?.["@graph"] as Record<string, unknown>[] || buildStructuredData(route, nextTitle, nextDescription, canonicalUrl),
    );
  }, [description, metadata, robots, route, title]);

  return null;
}
