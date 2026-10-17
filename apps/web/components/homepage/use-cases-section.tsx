"use client";

import { useState } from "react";
import { Store, Wrench, Stethoscope, Briefcase, CheckCircle2 } from "lucide-react";
import styles from "./homepage.module.css";

const USE_CASES = [
  {
    id: "ecommerce",
    title: "E-Commerce & Retail",
    icon: Store,
    summary: "Automate product availability questions, catalog PDF delivery, order detail capture, and restock notifications.",
    scenarios: [
      "Answers customer questions about size options, colors, and stock levels.",
      "Delivers PDF product catalogs or image bundles automatically upon request.",
      "Captures shipping address and item details for staff verification.",
      "Schedules restock alerts when out-of-stock items become available.",
    ],
  },
  {
    id: "services",
    title: "Local Services & Contractors",
    icon: Wrench,
    summary: "Handle service inquiries, pricing estimates, service area coverage, and appointment scheduling requests.",
    scenarios: [
      "Explains service packages, coverage areas, and standard service rates.",
      "Collects preliminary job details and photos sent by customers in chat.",
      "Schedules follow-up appointment confirmation calls for sales staff.",
      "Provides instant automated answers during after-hours service inquiries.",
    ],
  },
  {
    id: "clinics",
    title: "Clinics & Appointments",
    icon: Stethoscope,
    summary: "Provide clinic operating hours, doctor availability information, location directions, and appointment requests.",
    scenarios: [
      "Provides clinic opening hours, consultation fees, and specialist availability.",
      "Sends clinic location maps and pre-appointment preparation guidelines.",
      "Gathers patient inquiry details for reception staff confirmation.",
      "Sends automated visit reminders to reduce missed appointment slots.",
    ],
  },
  {
    id: "agencies",
    title: "Agencies & Service Teams",
    icon: Briefcase,
    summary: "Manage multiple client WhatsApp numbers, agency service packages, and inbound lead qualification.",
    scenarios: [
      "Manages client WhatsApp instances from a unified multi-instance dashboard.",
      "Qualifies inbound agency leads with structured questionnaire prompts.",
      "Delivers agency service portfolios and onboarding PDFs automatically.",
      "Pauses AI replies per conversation so account managers can step in seamlessly.",
    ],
  },
] as const;

export function UseCasesSection() {
  const [activeUseCase, setActiveUseCase] = useState<(typeof USE_CASES)[number]["id"]>("ecommerce");

  const current = USE_CASES.find((u) => u.id === activeUseCase) || USE_CASES[0];
  const Icon = current.icon;

  return (
    <section id="use-cases" className={styles.section}>
      <div className={styles.container}>
        <div className={styles.sectionHeader}>
          <span className={styles.eyebrow}>Industry Workflows</span>
          <h2 className={styles.sectionTitle}>Tailored WhatsApp Workflows for Every Business Type</h2>
          <p className={styles.sectionDesc}>
            Discover practical, scenario-based applications designed to solve customer response friction across diverse industries.
          </p>
        </div>

        {/* Industry Selection Bar */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.75rem",
            justifyContent: "center",
            marginBottom: "2.5rem",
          }}
        >
          {USE_CASES.map((uc) => {
            const TabIcon = uc.icon;
            const isActive = activeUseCase === uc.id;
            return (
              <button
                key={uc.id}
                type="button"
                onClick={() => setActiveUseCase(uc.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.625rem 1.125rem",
                  borderRadius: "0.625rem",
                  fontSize: "0.9375rem",
                  fontWeight: 600,
                  backgroundColor: isActive ? "var(--ca-brand)" : "var(--ca-surface-1)",
                  color: isActive ? "var(--ca-text-inverse, #ffffff)" : "var(--ca-text-secondary)",
                  border: "1px solid var(--ca-border)",
                  cursor: "pointer",
                  transition: "all 140ms ease",
                }}
              >
                <TabIcon size={18} />
                <span>{uc.title}</span>
              </button>
            );
          })}
        </div>

        {/* Active Industry Display Card */}
        <div className={styles.card} style={{ maxWidth: "56rem", margin: "0 auto", padding: "2rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
            <div style={{ width: "2.75rem", height: "2.75rem", borderRadius: "0.625rem", backgroundColor: "var(--ca-brand-soft)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ca-brand)" }}>
              <Icon size={24} />
            </div>
            <div>
              <h3 style={{ fontSize: "1.375rem", fontWeight: 700, color: "var(--ca-text-primary)" }}>{current.title}</h3>
              <p style={{ fontSize: "0.875rem", color: "var(--ca-text-muted)" }}>Scenario-based operational workflow</p>
            </div>
          </div>

          <p style={{ fontSize: "1.0625rem", color: "var(--ca-text-secondary)", lineHeight: 1.6, marginBottom: "1.5rem" }}>
            {current.summary}
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem" }}>
            {current.scenarios.map((sc, i) => (
              <div key={i} style={{ backgroundColor: "var(--ca-surface-2)", padding: "1rem", borderRadius: "0.625rem", border: "1px solid var(--ca-border-subtle)", display: "flex", alignItems: "flex-start", gap: "0.625rem" }}>
                <CheckCircle2 size={18} style={{ color: "var(--ca-brand)", flexShrink: 0, marginTop: "0.125rem" }} />
                <div style={{ fontSize: "0.875rem", color: "var(--ca-text-primary)", lineHeight: 1.5 }}>{sc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
