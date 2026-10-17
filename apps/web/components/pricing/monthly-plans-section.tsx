import { ButtonLink } from "@/components/button-link";
import { CURRENT_CTA_LINKS } from "@/lib/cta-links";
import { BILLING_PLAN_DETAILS } from "@/lib/public-content";
import { Check, Sparkles } from "lucide-react";
import styles from "./pricing.module.css";

export function MonthlyPlansSection() {
  const plans = [
    {
      ...BILLING_PLAN_DETAILS.starter_plan,
      badge: undefined,
      description: "Ideal for small businesses starting with one WhatsApp number and core catalog capacity.",
      features: [
        "1 WhatsApp instance included (max 2 with add-on)",
        "5 products or services included (max 30 with add-on)",
        "1,000 customer records included",
        "300 orders / month capacity",
        "100 media templates & 2 media groups",
        "3 sequence groups",
        "Standard support level",
      ],
    },
    {
      ...BILLING_PLAN_DETAILS.growth_plan,
      badge: "Recommended for Growing Teams",
      description: "For growing teams managing multiple WhatsApp numbers, expanded catalogs, and higher chat volume.",
      features: [
        "3 WhatsApp instances included (max 7 with add-ons)",
        "30 products or services included (max 150 with add-ons)",
        "10,000 customer records included",
        "2,000 orders / month capacity",
        "500 media templates & 5 media groups",
        "10 sequence groups",
        "Priority support level",
        "Courier integration support",
      ],
    },
    {
      ...BILLING_PLAN_DETAILS.pro_plan,
      badge: undefined,
      description: "For larger operations, agencies, or higher-volume businesses needing max capacity and control.",
      features: [
        "10 WhatsApp instances included (max 30 with add-ons)",
        "100 products or services included (max 500 with add-ons)",
        "50,000 customer records included",
        "10,000 orders / month capacity",
        "2,000 media templates & 15 media groups",
        "30 sequence groups",
        "Priority support level",
        "Higher usage capacity",
      ],
    },
  ];

  return (
    <section id="plans" className={`${styles.section} ${styles.plansSection}`}>
      <div className={styles.header}>
        <div className={styles.eyebrow}>
          <Sparkles size={14} /> Monthly Subscription Plans
        </div>
        <h2 className={styles.title}>Choose the Plan That Matches Your Business</h2>
        <p className={styles.subtitle}>
          All monthly plans include platform workspace access, catalog management, customer 360 records, and core operational controls.
        </p>
      </div>

      <div className={styles.cardsGrid}>
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`${styles.planCard} ${plan.badge ? styles.planCardHighlighted : ""}`}
          >
            {plan.badge && <div className={styles.badge}>{plan.badge}</div>}
            <h3 className={styles.planName}>{plan.name}</h3>
            <p className={styles.planDesc}>{plan.description}</p>
            <div className={styles.priceWrapper}>
              <span className={styles.priceAmount}>${plan.monthlyPrice}</span>
              <span className={styles.pricePeriod}>/ month</span>
            </div>
            <ul className={styles.highlightsList}>
              {plan.features.map((feat, i) => (
                <li key={i} className={styles.highlightItem}>
                  <Check size={16} className={styles.checkIcon} />
                  <span>{feat}</span>
                </li>
              ))}
            </ul>
            <ButtonLink
              href={CURRENT_CTA_LINKS.startTrial}
              variant={plan.badge ? "primary" : "secondary"}
              showArrow
            >
              Start Free
            </ButtonLink>
          </div>
        ))}
      </div>
    </section>
  );
}
