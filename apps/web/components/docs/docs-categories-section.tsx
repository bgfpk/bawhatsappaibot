import React from "react";
import Link from "next/link";
import { Grid, Layers, Cpu, Users, Layers3, Code, CreditCard, AlertTriangle, ArrowRight } from "lucide-react";
import styles from "./docs.module.css";

export const CATEGORY_SECTION_CARDS = [
  {
    id: "getting-started",
    anchor: "/docs/getting-started",
    badge: "Guide 1",
    title: "Quick Start & Setup",
    icon: <Layers size={20} />,
    desc: "Account creation, legal acceptance, trial planning, and pre-connection preparation checklist.",
  },
  {
    id: "whatsapp-setup",
    anchor: "/docs/whatsapp-setup",
    badge: "Guide 2",
    title: "WhatsApp & QR Setup",
    icon: <Cpu size={20} />,
    desc: "QR connection basics, linked-device rules, session ownership, and reset login reconnect behavior.",
  },
  {
    id: "intelligence-reply-behavior",
    anchor: "/docs/intelligence-reply-behavior",
    badge: "Guide 3",
    title: "Intelligence & AI Rules",
    icon: <Cpu size={20} />,
    desc: "Configure AI instructions, business context, and reply modes (Always Text, Always Voice, Text Preferred).",
  },
  {
    id: "products-services-media-sequences",
    anchor: "/docs/products-services-media-sequences",
    badge: "Guide 4",
    title: "Products & Media",
    icon: <Layers3 size={20} />,
    desc: "Products catalog setup, media groups, template capture, and reusable customer messaging logic.",
  },
  {
    id: "crm-pipeline-smart-actions",
    anchor: "/docs/crm-pipeline-smart-actions",
    badge: "Guide 5",
    title: "CRM & Smart Pipeline",
    icon: <Users size={20} />,
    desc: "Customer 360 profiles, automated lead tags, custom order fields, and pipeline status triggers.",
  },
  {
    id: "followups-customer-updates",
    anchor: "/docs/followups-customer-updates",
    badge: "Guide 6",
    title: "Follow-up Center",
    icon: <Layers3 size={20} />,
    desc: "Scheduled sequences, AI Smart Follow-ups, and post-purchase customer status updates.",
  },
  {
    id: "api-webhooks",
    anchor: "/docs/api-webhooks",
    badge: "Guide 7",
    title: "API & Store Webhooks",
    icon: <Code size={20} />,
    desc: "Public API key management, webhook payload signatures, and order event integration rules.",
  },
  {
    id: "website-knowledge-wordpress",
    anchor: "/docs/website-knowledge-wordpress",
    badge: "Guide 8",
    title: "WooCommerce & Knowledge",
    icon: <Code size={20} />,
    desc: "WooCommerce catalog knowledge formatting, WordPress connector, and URL website crawling.",
  },
  {
    id: "courier-integrations-setup",
    anchor: "/docs/courier-integrations-setup",
    badge: "Guide 9",
    title: "Courier Setup",
    icon: <Code size={20} />,
    desc: "PostEx API token and Leopards merchant credential configuration for parcel tracking lookups.",
  },
  {
    id: "cod-order-confirmation-setup",
    anchor: "/docs/cod-order-confirmation-setup",
    badge: "Guide 10",
    title: "COD Confirmation Setup",
    icon: <Users size={20} />,
    desc: "Post-checkout webhooks, COD address verification prompts, and order state management.",
  },
  {
    id: "plans-wallet-source-values",
    anchor: "/docs/plans-wallet-source-values",
    badge: "Guide 11",
    title: "Plans, Wallet & Rates",
    icon: <CreditCard size={20} />,
    desc: "Subscription plans ($9, $29, $89), included capacity, wallet usage, and current source values.",
  },
  {
    id: "daily-operations-safe-controls",
    anchor: "/docs/daily-operations-safe-controls",
    badge: "Guide 12",
    title: "Daily Controls & Handoff",
    icon: <AlertTriangle size={20} />,
    desc: "Auto-reply control, chat shortcuts (.0, .00, .1), staff takeover, and Stop Engine rules.",
  },
  {
    id: "launch-safety-client-responsibility",
    anchor: "/docs/launch-safety-client-responsibility",
    badge: "Guide 13",
    title: "Safety & Compliance",
    icon: <AlertTriangle size={20} />,
    desc: "Go-live checklist, WhatsApp policy compliance, avoiding cold abuse, and client responsibility.",
  },
];

export function DocsCategoriesSection() {
  return (
    <section id="categories" className={styles.section}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.eyebrow}>
            <Grid size={14} /> Documentation Categories
          </div>
          <h2 className={styles.title}>Browse Structured Categories</h2>
          <p className={styles.subtitle}>
            Explore thirteen distinct operational sections to find exact setup guides, technical specs, and practical troubleshooting.
          </p>
        </div>

        <div className={styles.categoryGrid}>
          {CATEGORY_SECTION_CARDS.map((cat) => (
            <Link key={cat.id} href={cat.anchor} className={styles.categoryCard}>
              <span className={styles.categoryBadge}>{cat.badge}</span>
              <h3 className={styles.categoryTitle}>
                {cat.title} {cat.icon}
              </h3>
              <p className={styles.categoryDesc}>{cat.desc}</p>
              <span className={styles.categoryLinkText}>
                Open Category Guide <ArrowRight size={14} />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
