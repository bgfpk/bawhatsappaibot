import { Homepage } from "@/components/homepage/homepage";
import { StructuredData, buildBreadcrumbSchema, buildWebPageSchema } from "@/components/structured-data";
import { buildPageMetadata } from "@/lib/metadata";
import { PUBLIC_SITE_CONFIG } from "@/lib/site-config";

export const metadata = buildPageMetadata("/");

export default function HomePage() {
  return (
    <>
      <StructuredData
        data={buildWebPageSchema({
          path: "/",
          name: "BlackArrow | WhatsApp AI Automation for Sales, Orders, and Support",
          description:
            "BlackArrow helps businesses automate WhatsApp customer replies, voice notes, product guidance, orders, and follow-ups from one client-facing dashboard.",
        })}
      />
      <StructuredData data={buildBreadcrumbSchema([{ name: "Home", url: PUBLIC_SITE_CONFIG.siteUrl }])} />
      <Homepage />
    </>
  );
}
