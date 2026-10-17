import React from "react";
import { BlogIndexContent } from "@/components/blog/blog-index-content";
import { StructuredData, buildBreadcrumbSchema, buildWebPageSchema } from "@/components/structured-data";
import { buildPageMetadata } from "@/lib/metadata";
import { PUBLIC_SITE_CONFIG } from "@/lib/site-config";

export const metadata = buildPageMetadata("/blog");

export default function BlogPage() {
  return (
    <>
      <StructuredData
        data={buildWebPageSchema({
          path: "/blog",
          name: "BlackArrow Blog | WhatsApp Operations, AI & Business Workflows",
          description:
            "Read articles and guides on WhatsApp automation, AI customer support, order capture, and lead management for growing businesses.",
          type: "CollectionPage",
        })}
      />
      <StructuredData
        data={buildBreadcrumbSchema([
          { name: "Home", url: PUBLIC_SITE_CONFIG.siteUrl },
          { name: "Blog", url: `${PUBLIC_SITE_CONFIG.siteUrl}/blog` },
        ])}
      />
      <BlogIndexContent />
    </>
  );
}
