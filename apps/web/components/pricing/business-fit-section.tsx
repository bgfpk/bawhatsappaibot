import Link from "next/link";
import { Target } from "lucide-react";
import styles from "./pricing.module.css";

export function BusinessFitSection() {
  const fitCards = [
    {
      plan: "Starter ($9/mo)",
      target: "Single-Number Operations",
      description:
        "Best for boutique sellers, freelancers, or small businesses beginning with WhatsApp AI automation on a single business number with up to 5 products.",
      link: { href: "/whatsapp-automation-for-small-business", label: "Small business automation" },
    },
    {
      plan: "Growth ($29/mo)",
      target: "Growing E-Commerce & Service Teams",
      description:
        "Designed for active stores and regional brands managing multiple numbers, up to 30 catalog items, 10,000 customers, and courier tracking integrations.",
      link: { href: "/whatsapp-cod-order-automation", label: "COD & ecommerce automation" },
    },
    {
      plan: "Pro ($89/mo)",
      target: "Multi-Number Brands & High-Volume Operations",
      description:
        "Built for multi-branch operations, high-volume sellers, or agencies managing up to 10 WhatsApp numbers, 100 products, and 50,000 customer records.",
      link: { href: "/whatsapp-bot-pricing", label: "Detailed bot pricing" },
    },
  ];

  return (
    <section id="business-fit" className={styles.section}>
      <div className={styles.header}>
        <div className={styles.eyebrow}>
          <Target size={14} /> Decision Guide
        </div>
        <h2 className={styles.title}>Which Plan Fits Your WhatsApp Business?</h2>
        <p className={styles.subtitle}>
          Match your plan selection to your actual operating scale and team workflow requirements. Explore our <Link href="/whatsapp-bot-pricing" style={{ color: "var(--ca-accent-primary)", textDecoration: "underline" }}>WhatsApp bot pricing overview</Link> for detailed cost breakdowns.
        </p>
      </div>

      <div className={styles.fitGrid}>
        {fitCards.map((card, idx) => (
          <div key={idx} className={styles.fitCard}>
            <div className={styles.fitPlanName}>{card.plan}</div>
            <h3 style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--ca-text-bright)" }}>
              {card.target}
            </h3>
            <p className={styles.fitDescription}>{card.description}</p>
            <div style={{ marginTop: "1rem", paddingTop: "0.75rem", borderTop: "1px solid var(--ca-border-subtle)" }}>
              <Link href={card.link.href} style={{ fontSize: "0.875rem", color: "var(--ca-accent-primary)", fontWeight: 500 }}>
                {card.link.label} &rarr;
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
