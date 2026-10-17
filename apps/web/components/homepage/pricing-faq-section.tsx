"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Sparkles, HelpCircle, ShieldCheck } from "lucide-react";
import { BILLING_PLAN_DETAILS } from "@/lib/public-content";
import { CURRENT_CTA_LINKS } from "@/lib/cta-links";
import styles from "./homepage.module.css";

import { HOMEPAGE_FAQS } from "@/lib/homepage-faqs";

const FAQS = HOMEPAGE_FAQS.map((faq) => ({
  q: faq.question,
  a: faq.answer,
}));

export function PricingFaqSection() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const toggleFaq = (idx: number) => {
    setOpenFaq(openFaq === idx ? null : idx);
  };

  const plans = [
    {
      data: BILLING_PLAN_DETAILS.starter_plan,
      buttonText: "Choose Starter",
      popular: false,
    },
    {
      data: BILLING_PLAN_DETAILS.growth_plan,
      buttonText: "Choose Growth",
      popular: true,
    },
    {
      data: BILLING_PLAN_DETAILS.pro_plan,
      buttonText: "Choose Pro",
      popular: false,
    },
  ];

  return (
    <section id="pricing" className={styles.section}>
      <div className={styles.container}>
        {/* Section Header */}
        <div className={styles.sectionHeader}>
          <span className={styles.eyebrow}>Transparent Pricing</span>
          <h2 className={styles.sectionTitle}>Transparent Monthly Plans &amp; Itemized Wallet Rates</h2>
          <p className={styles.sectionDesc}>
            Every plan includes a 7-day trial and $1 AI test credit. Choose a plan tier that fits your store capacity.
          </p>
        </div>

        {/* 3 Pricing Cards */}
        <div className={styles.grid3} style={{ marginBottom: "3.5rem", alignItems: "stretch" }}>
          {plans.map(({ data, buttonText, popular }) => (
            <div
              key={data.id}
              className={styles.card}
              style={{
                position: "relative",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                borderColor: popular ? "var(--ca-brand)" : undefined,
                boxShadow: popular ? "0 8px 24px rgba(50, 207, 145, 0.15)" : undefined,
                backgroundColor: popular ? "var(--ca-surface-1)" : "var(--ca-surface-1)",
              }}
            >
              {popular && (
                <div
                  style={{
                    position: "absolute",
                    top: "-0.875rem",
                    left: "50%",
                    transform: "translateX(-50%)",
                    backgroundColor: "var(--ca-brand)",
                    color: "var(--ca-text-inverse, #ffffff)",
                    fontSize: "0.75rem",
                    fontWeight: 800,
                    padding: "0.2rem 0.75rem",
                    borderRadius: "9999px",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Most Popular
                </div>
              )}

              <div>
                <h3 style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--ca-text-primary)", marginBottom: "0.25rem" }}>
                  {data.name} Plan
                </h3>
                <div style={{ display: "flex", alignItems: "baseline", gap: "0.25rem", margin: "1rem 0 1.25rem" }}>
                  <span style={{ fontSize: "2.5rem", fontWeight: 800, color: "var(--ca-text-primary)" }}>${data.monthlyPrice}</span>
                  <span style={{ fontSize: "0.9375rem", color: "var(--ca-text-muted)" }}>/month</span>
                </div>

                <ul style={{ display: "flex", flexDirection: "column", gap: "0.75rem", fontSize: "0.875rem", color: "var(--ca-text-secondary)", marginBottom: "1.75rem" }}>
                  {data.highlights.map((h, i) => (
                    <li key={i} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <Check size={16} style={{ color: "var(--ca-brand)", flexShrink: 0 }} />
                      <span>{h}</span>
                    </li>
                  ))}
                  <li style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <Check size={16} style={{ color: "var(--ca-brand)", flexShrink: 0 }} />
                    <span>Up to {data.ordersPerMonth.toLocaleString()} orders/mo</span>
                  </li>
                  <li style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <Check size={16} style={{ color: "var(--ca-brand)", flexShrink: 0 }} />
                    <span>{data.support}</span>
                  </li>
                </ul>
              </div>

              <Link
                href={CURRENT_CTA_LINKS.startTrial}
                className={popular ? styles.btnPrimary : styles.btnSecondary}
                style={{ width: "100%", textDecoration: "none" }}
              >
                {buttonText}
              </Link>
            </div>
          ))}
        </div>

        {/* Itemized Usage Rates Card */}
        <div className={styles.card} style={{ maxWidth: "56rem", margin: "0 auto 4rem", backgroundColor: "var(--ca-surface-2)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--ca-brand-strong)", fontWeight: 700, marginBottom: "0.75rem" }}>
            <Sparkles size={18} />
            <h3 style={{ fontSize: "1.125rem", color: "var(--ca-text-primary)" }}>Itemized Pay-As-You-Go AI Wallet Rates</h3>
          </div>

          <p style={{ fontSize: "0.875rem", color: "var(--ca-text-secondary)", marginBottom: "1.25rem" }}>
            AI response actions are billed transparently per usage from your credit wallet balance:
          </p>

          <div className={styles.centeredFlexGrid}>
            <div className={styles.centeredFlexItemSmall} style={{ backgroundColor: "var(--ca-canvas-1)", padding: "0.875rem", borderRadius: "0.5rem", border: "1px solid var(--ca-border-subtle)" }}>
              <div style={{ fontSize: "0.78125rem", color: "var(--ca-text-muted)", marginBottom: "0.25rem" }}>AI Text Response</div>
              <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--ca-brand-strong)" }}>$0.003 / reply</div>
            </div>
            <div className={styles.centeredFlexItemSmall} style={{ backgroundColor: "var(--ca-canvas-1)", padding: "0.875rem", borderRadius: "0.5rem", border: "1px solid var(--ca-border-subtle)" }}>
              <div style={{ fontSize: "0.78125rem", color: "var(--ca-text-muted)", marginBottom: "0.25rem" }}>Image Understanding</div>
              <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--ca-brand-strong)" }}>$0.007 / image</div>
            </div>
            <div className={styles.centeredFlexItemSmall} style={{ backgroundColor: "var(--ca-canvas-1)", padding: "0.875rem", borderRadius: "0.5rem", border: "1px solid var(--ca-border-subtle)" }}>
              <div style={{ fontSize: "0.78125rem", color: "var(--ca-text-muted)", marginBottom: "0.25rem" }}>Voice Note Understanding</div>
              <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--ca-brand-strong)" }}>$0.010 / voice note</div>
            </div>
            <div className={styles.centeredFlexItemSmall} style={{ backgroundColor: "var(--ca-canvas-1)", padding: "0.875rem", borderRadius: "0.5rem", border: "1px solid var(--ca-border-subtle)" }}>
              <div style={{ fontSize: "0.78125rem", color: "var(--ca-text-muted)", marginBottom: "0.25rem" }}>Generated Voice Reply</div>
              <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--ca-brand-strong)" }}>from $0.020 / reply</div>
            </div>
            <div className={styles.centeredFlexItemSmall} style={{ backgroundColor: "var(--ca-canvas-1)", padding: "0.875rem", borderRadius: "0.5rem", border: "1px solid var(--ca-border-subtle)" }}>
              <div style={{ fontSize: "0.78125rem", color: "var(--ca-text-muted)", marginBottom: "0.25rem" }}>Sequence / Template Send</div>
              <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--ca-brand-strong)" }}>$0.0005 / item</div>
            </div>
            <div className={styles.centeredFlexItemSmall} style={{ backgroundColor: "var(--ca-canvas-1)", padding: "0.875rem", borderRadius: "0.5rem", border: "1px solid var(--ca-border-subtle)" }}>
              <div style={{ fontSize: "0.78125rem", color: "var(--ca-text-muted)", marginBottom: "0.25rem" }}>Media Group File Send</div>
              <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--ca-brand-strong)" }}>$0.001 / file</div>
            </div>
          </div>
        </div>

        {/* Frequently Asked Questions */}
        <div id="faqs" style={{ maxWidth: "48rem", margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "2rem" }}>
            <h3 style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--ca-text-primary)", marginBottom: "0.5rem" }}>
              Frequently Asked Questions
            </h3>
            <p style={{ fontSize: "1rem", color: "var(--ca-text-secondary)" }}>
              Clear, fact-checked answers about setup, operation, billing, and WhatsApp compliance.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {FAQS.map((faq, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div
                  key={idx}
                  className={styles.card}
                  style={{ padding: "1rem 1.25rem", cursor: "pointer" }}
                  onClick={() => toggleFaq(idx)}
                >
                  <button
                    type="button"
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      background: "none",
                      border: "none",
                      padding: 0,
                      textAlign: "left",
                      color: "var(--ca-text-primary)",
                      fontWeight: 600,
                      fontSize: "1rem",
                      cursor: "pointer",
                    }}
                    aria-expanded={isOpen}
                  >
                    <span>{faq.q}</span>
                    <ChevronDown
                      size={18}
                      style={{
                        transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                        transition: "transform 180ms ease",
                        color: "var(--ca-brand-strong)",
                        flexShrink: 0,
                      }}
                    />
                  </button>

                  {isOpen && (
                    <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid var(--ca-border-subtle)", fontSize: "0.9375rem", color: "var(--ca-text-secondary)", lineHeight: 1.6 }}>
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
