import type { Metadata } from "next";

import { resolvePublicSeoMetadata } from "@/lib/public-content";
import { PUBLIC_SITE_CONFIG } from "@/lib/site-config";

const OG_IMAGE_PATH = "/brand/black-arrow-social-card.png";

export function buildPageMetadata(pathname: string): Metadata {
  const seo = resolvePublicSeoMetadata(pathname);
  const title = seo.title;
  const description = seo.description;
  const absoluteUrl = `${PUBLIC_SITE_CONFIG.siteUrl}${seo.canonicalPath === "/" ? "" : seo.canonicalPath}`;
  const ogImageUrl = `${PUBLIC_SITE_CONFIG.siteUrl}${OG_IMAGE_PATH}`;

  return {
    title,
    description,
    keywords: seo.keywords,
    alternates: {
      canonical: absoluteUrl,
    },
    openGraph: {
      title,
      description,
      url: absoluteUrl,
      siteName: "BlackArrow",
      type: seo.ogType,
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: "BlackArrow - WhatsApp AI Automation for Sales, Orders, and Support",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
    robots:
      seo.robots === "index,follow"
        ? { index: true, follow: true }
        : { index: false, follow: false },
  };
}
