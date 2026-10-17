import type { Metadata } from "next";
import { Manrope, Space_Grotesk } from "next/font/google";
import type { ReactNode } from "react";

import { GA4Analytics } from "@/components/ga4-analytics";
import { SiteShell } from "@/components/site-shell";
import {
  StructuredData,
  buildRootGraphSchema,
} from "@/components/structured-data";
import { PUBLIC_SITE_CONFIG } from "@/lib/site-config";

import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(PUBLIC_SITE_CONFIG.siteUrl),
  title: "BlackArrow | WhatsApp AI Assistant for Sales, Support, and Order Capture",
  description:
    "BlackArrow is a WhatsApp AI business assistant for customer replies, sales and order capture, follow-ups, and team visibility.",
  icons: {
    icon: "/brand/black-arrow-icon.png",
    shortcut: "/brand/black-arrow-icon.png",
    apple: "/brand/black-arrow-icon.png",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var k="blackarrow-public-theme";var v=localStorage.getItem(k);var t=v==="light"||v==="dark"?v:"dark";document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t}catch(e){document.documentElement.dataset.theme="dark"}})();`,
          }}
        />
      </head>
      <body className={`${manrope.variable} ${spaceGrotesk.variable}`}>
        {/* GA4 Analytics & Client Navigation Tracking */}
        <GA4Analytics />
        {/* Graph structured data (combines buildOrganizationSchema, buildWebsiteSchema, buildSoftwareSchema) */}
        <StructuredData data={buildRootGraphSchema()} />
        <SiteShell>{children}</SiteShell>
      </body>
    </html>
  );
}
