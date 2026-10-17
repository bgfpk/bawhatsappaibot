import React from "react";
import {
  StructuredData,
  buildBreadcrumbSchema,
  buildWebPageSchema,
} from "@/components/structured-data";
import { DocsPageContent } from "@/components/docs/docs-page-content";
import { buildPageMetadata } from "@/lib/metadata";
import { PUBLIC_SITE_CONFIG } from "@/lib/site-config";

export const metadata = buildPageMetadata("/docs");

export default function DocsPage() {
  return (
    <>
      <StructuredData
        data={buildWebPageSchema({
          path: "/docs",
          name: "BlackArrow Documentation | User Guides & Setup Manuals",
          description:
            "Browse BlackArrow documentation guides for Linked Devices QR setup, intelligence instructions, order capture, human takeover, and wallet AI costs.",
          type: "CollectionPage",
        })}
      />
      <StructuredData
        data={buildBreadcrumbSchema([
          { name: "Home", url: PUBLIC_SITE_CONFIG.siteUrl },
          { name: "Docs", url: `${PUBLIC_SITE_CONFIG.siteUrl}/docs` },
        ])}
      />

      <DocsPageContent />
    </>
  );
}
