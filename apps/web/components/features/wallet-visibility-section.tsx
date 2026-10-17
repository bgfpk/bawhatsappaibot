import Link from "next/link";
import { Wallet, ArrowRight, DollarSign, Shield, Receipt } from "lucide-react";
import { FULL_SETUP_PRICE } from "@/lib/public-content";
import styles from "./features.module.css";

const RATES = [
  { item: "AI Text Response", rate: "$0.003 / reply", desc: "Automated business-trained chat response" },
  { item: "Image Understanding", rate: "$0.007 / image", desc: "Visual product code & photo classification" },
  { item: "Voice Note Understanding", rate: "$0.010 / voice note", desc: "Gemini audio transcription & intent analysis" },
  { item: "Generated Voice Reply", rate: "from $0.020 / reply", desc: "TTS audio response generation" },
  { item: "Sequence / Template Send", rate: "$0.0005 / item", desc: "Multi-step sequence step delivery" },
  { item: "Media Group File Send", rate: "$0.001 / file", desc: "Product brochure, image set, or document send" },
];

export function WalletVisibilitySection() {
  return (
    <section id="usage-billing" className={styles.section}>
      <div id="billing-wallet" />
      <div className={styles.container}>
        <div className={styles.sectionHeader}>
          <span className={styles.eyebrow}>Usage &amp; Cost Visibility</span>
          <h2 className={styles.sectionTitle}>Transparent Wallet Billing &amp; Itemized Deduction Rates</h2>
          <p className={styles.sectionDesc}>
            Monthly subscriptions cover platform workspace access, while your prepaid wallet handles pay-as-you-go AI usage with full itemized log transparency.
          </p>
        </div>

        {/* Wallet & Rates Visual */}
        <div className={styles.mockupShell} style={{ marginBottom: "2rem" }}>
          <div className={styles.mockupHeader}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Wallet size={16} style={{ color: "var(--ca-brand)" }} />
              <span>Pay-As-You-Go AI Wallet Rates</span>
            </div>
            <span className={`${styles.badge} ${styles.badgeBrand}`}>Min. Top-Up $5</span>
          </div>

          <div className={styles.mockupBody}>
            <div className={styles.centeredGrid} style={{ marginBottom: "1.5rem" }}>
              {RATES.map((r) => (
                <div key={r.item} className={`${styles.card} ${styles.gridItem4}`} style={{ backgroundColor: "var(--ca-surface-2)", padding: "1rem" }}>
                  <div style={{ fontWeight: 700, fontSize: "0.875rem", color: "var(--ca-text-primary)", marginBottom: "0.25rem" }}>{r.item}</div>
                  <div style={{ fontSize: "1rem", fontWeight: 800, color: "var(--ca-brand-strong)", marginBottom: "0.35rem" }}>{r.rate}</div>
                  <p style={{ fontSize: "0.75rem", color: "var(--ca-text-secondary)", margin: 0 }}>{r.desc}</p>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "1.5rem", padding: "1rem", backgroundColor: "var(--ca-surface-3)", borderRadius: "0.75rem", fontSize: "0.8125rem", color: "var(--ca-text-secondary)" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <Receipt size={16} style={{ color: "var(--ca-brand)" }} /> Minimum Wallet Top-Up: <strong>$5</strong>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <Shield size={16} style={{ color: "#60A5FA" }} /> Optional Full Setup: <strong>${FULL_SETUP_PRICE}</strong>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <DollarSign size={16} style={{ color: "#F59E0B" }} /> 7-Day Trial Includes <strong>$1 AI Credit</strong>
              </span>
            </div>
          </div>
        </div>

        <div style={{ textAlign: "center" }}>
          <Link href="/pricing" className={styles.btnSecondary}>
            <span>View Full Pricing Page</span>
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}
