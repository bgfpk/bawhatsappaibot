import type { ReactNode } from "react";
import Link from "next/link";
import { HomepageHeader } from "@/components/homepage/homepage-header";
import { HomepageFooter } from "@/components/homepage/homepage-footer";
import { PUBLIC_SITE_CONFIG } from "@/lib/site-config";

export const FOOTER_GROUPS = [
  {
    title: "Product",
    links: [
      { href: "/", label: "Overview" },
      { href: "/features", label: "Features" },
      { href: "/integrations", label: "Integrations" },
      { href: "/pricing", label: "Pricing" },
      { href: "/docs", label: "Docs" },
      { href: "/blog", label: "Blog" },
    ],
  },
  {
    title: "Solutions",
    links: [
      { href: "/whatsapp-automation", label: "WhatsApp Automation" },
      { href: "/ai-whatsapp-bot", label: "AI WhatsApp Bot" },
      { href: "/whatsapp-customer-support", label: "Customer Support" },
      { href: "/ecommerce-whatsapp-bot", label: "Ecommerce Bot" },
      { href: "/whatsapp-order-capture", label: "Order Capture" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/contact", label: "Contact" },
      { href: "/terms", label: "Terms" },
      { href: "/privacy", label: "Privacy" },
      { href: "/disclaimer", label: "Disclaimer" },
    ],
  },
];

export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div className="site-frame">
      <HomepageHeader />
      <main id="main-content">{children}</main>
      <HomepageFooter />
      {/* 
        Footer Support Reference: PUBLIC_SITE_CONFIG.supportEmail
        Footer Trademark Notice:
        WhatsApp is a trademark of Meta Platforms, Inc. BlackArrow is not affiliated with or endorsed by WhatsApp or Meta.
      */}
    </div>
  );
}

