import Link from "next/link";

import { ThemeToggle } from "./theme-toggle";

export const PUBLIC_NAV_ITEMS = [
  { href: "/features", label: "Product" },
  { href: "/#how-it-works", label: "How It Works" },
  { href: "/integrations", label: "Integrations" },
  { href: "/pricing", label: "Pricing" },
  { href: "/docs", label: "Resources" },
] as const;

export function SiteNavigation() {
  return (
    <>
      <div className="nav-links">
        {PUBLIC_NAV_ITEMS.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}
      </div>
      <details className="mobile-nav">
        <summary aria-label="Open main navigation">Menu</summary>
        <div className="mobile-nav-panel">
          {PUBLIC_NAV_ITEMS.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}
          <ThemeToggle mobile />
        </div>
      </details>
    </>
  );
}
