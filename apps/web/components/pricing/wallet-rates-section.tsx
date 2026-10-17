import { AI_USAGE_RATES, WALLET_TOPUP_AMOUNTS } from "@/lib/public-content";
import { MessageSquareText, Image, Mic, Volume2, Send, FileText, Wallet, CheckCircle2 } from "lucide-react";
import styles from "./pricing.module.css";

export function WalletRatesSection() {
  const minTopup = Math.min(...WALLET_TOPUP_AMOUNTS);

  const rateIcons = [
    <MessageSquareText key="1" size={20} style={{ color: "var(--ca-brand)" }} />,
    <Image key="2" size={20} style={{ color: "var(--ca-brand)" }} />,
    <Mic key="3" size={20} style={{ color: "var(--ca-brand)" }} />,
    <Volume2 key="4" size={20} style={{ color: "var(--ca-brand)" }} />,
    <Send key="5" size={20} style={{ color: "var(--ca-brand)" }} />,
    <FileText key="6" size={20} style={{ color: "var(--ca-brand)" }} />,
  ];

  const rateSubtexts = [
    "Automated customer chat response using configured business knowledge",
    "Visual analysis of incoming product photos, screenshots, or receipts",
    "Gemini audio transcription and intent recognition for voice messages",
    "Natural text-to-speech audio reply generation for customer chats",
    "Multi-step automated follow-up sequence step dispatches",
    "Catalog brochures, product image sets, or document dispatches",
  ];

  return (
    <section id="wallet-rates" className={`${styles.section} ${styles.sectionMuted}`}>
      <div className={styles.header}>
        <div className={styles.eyebrow}>
          <Wallet size={14} /> Transparent Itemized Deduction
        </div>
        <h2 className={styles.title}>Pay-As-You-Go AI Wallet Rates</h2>
        <p className={styles.subtitle}>
          Your prepaid wallet handles AI understanding, replies, and automation sends. You are only charged for actual successfully processed actions with full itemized log visibility in your dashboard.
        </p>
      </div>

      <div className={styles.ratesGrid}>
        {AI_USAGE_RATES.map((rate, idx) => (
          <div key={rate.label} className={styles.rateCard}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
              {rateIcons[idx] || <Wallet size={20} style={{ color: "var(--ca-brand)" }} />}
              <span className={styles.rateLabel}>{rate.label}</span>
            </div>
            <div className={styles.ratePrice}>{rate.price}</div>
            <p className={styles.rateSubtext}>{rateSubtexts[idx]}</p>
          </div>
        ))}
      </div>

      <div className={styles.ratesSummaryBanner}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <CheckCircle2 size={16} style={{ color: "var(--ca-brand)" }} />
          <span>Minimum Wallet Top-Up: ${minTopup}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <CheckCircle2 size={16} style={{ color: "var(--ca-brand)" }} />
          <span>7-Day Trial Includes $1 AI Credit</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <CheckCircle2 size={16} style={{ color: "var(--ca-brand)" }} />
          <span>Itemized Dashboard Deductions</span>
        </div>
      </div>
    </section>
  );
}
