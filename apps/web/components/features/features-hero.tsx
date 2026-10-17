import Link from "next/link";
import { ArrowRight, Bot, MessageSquare, Database, UserCheck, ShoppingBag, ArrowDown } from "lucide-react";
import { CURRENT_CTA_LINKS } from "@/lib/cta-links";
import styles from "./features.module.css";

export function FeaturesHero() {
  return (
    <section id="features" className={styles.section} style={{ paddingTop: "5.5rem", paddingBottom: "4.5rem", backgroundColor: "var(--ca-canvas-1)" }}>
      <div className={styles.container}>
        <div style={{ textAlign: "center", maxWidth: "54rem", margin: "0 auto 3.5rem" }}>
          <span className={styles.eyebrow}>Product Features &amp; Architecture</span>
          <h1 className={styles.sectionTitle} style={{ fontSize: "clamp(2.25rem, 4vw, 3.5rem)", letterSpacing: "-0.02em" }}>
            One WhatsApp Workspace for AI Sales, Support, Orders, and Follow-Ups
          </h1>
          <p className={styles.sectionDesc} style={{ fontSize: "1.125rem", maxWidth: "46rem", margin: "0 auto 2rem" }}>
            Connect a business WhatsApp number to process customer text, voice notes, photos, and documents, reply grounded in configured business knowledge, capture orders, deliver media, and keep human operators in total control.
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: "1rem" }}>
            <Link href={CURRENT_CTA_LINKS.startTrial} className={styles.btnPrimary}>
              <span>Start Free</span>
              <ArrowRight size={18} />
            </Link>
            <Link href="/pricing" className={styles.btnSecondary}>
              <span>View Pricing</span>
            </Link>
          </div>
        </div>

        {/* Operational Workspace Visual Composition */}
        <div className={styles.mockupShell}>
          <div className={styles.mockupHeader}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <div style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "#EF4444" }} />
              <div style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "#F59E0B" }} />
              <div style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "#10B981" }} />
              <span style={{ marginLeft: "0.5rem" }}>BlackArrow Connected Workspace Pipeline</span>
            </div>
            <span className={`${styles.badge} ${styles.badgeBrand}`}>Linked Devices QR Active</span>
          </div>

          <div className={styles.mockupBody}>
            <div className={styles.centeredGrid}>
              {/* Step 1 */}
              <div className={`${styles.card} ${styles.gridItemSmall}`} style={{ backgroundColor: "var(--ca-surface-2)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--ca-brand-strong)", fontWeight: 700, fontSize: "0.875rem", marginBottom: "0.5rem" }}>
                  <MessageSquare size={16} />
                  <span>1. Customer Message</span>
                </div>
                <p style={{ fontSize: "0.8125rem", color: "var(--ca-text-secondary)", margin: 0 }}>
                  Incoming text, voice note, photo, or document via WhatsApp.
                </p>
              </div>

              {/* Step 2 */}
              <div className={`${styles.card} ${styles.gridItemSmall}`} style={{ backgroundColor: "var(--ca-surface-2)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--ca-blue, #425fa8)", fontWeight: 700, fontSize: "0.875rem", marginBottom: "0.5rem" }}>
                  <Bot size={16} />
                  <span>2. AI Understanding</span>
                </div>
                <p style={{ fontSize: "0.8125rem", color: "var(--ca-text-secondary)", margin: 0 }}>
                  Multimodal classification of intent, items, and buyer queries.
                </p>
              </div>

              {/* Step 3 */}
              <div className={`${styles.card} ${styles.gridItemSmall}`} style={{ backgroundColor: "var(--ca-surface-2)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--ca-amber, #835607)", fontWeight: 700, fontSize: "0.875rem", marginBottom: "0.5rem" }}>
                  <Database size={16} />
                  <span>3. Knowledge Match</span>
                </div>
                <p style={{ fontSize: "0.8125rem", color: "var(--ca-text-secondary)", margin: 0 }}>
                  Grounded response from configured instructions &amp; catalog.
                </p>
              </div>

              {/* Step 4 */}
              <div className={`${styles.card} ${styles.gridItemSmall}`} style={{ backgroundColor: "var(--ca-surface-2)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--ca-rose, #a94153)", fontWeight: 700, fontSize: "0.875rem", marginBottom: "0.5rem" }}>
                  <ShoppingBag size={16} />
                  <span>4. Order &amp; CRM Record</span>
                </div>
                <p style={{ fontSize: "0.8125rem", color: "var(--ca-text-secondary)", margin: 0 }}>
                  Structured Customer 360 entry and order details captured.
                </p>
              </div>

              {/* Step 5 */}
              <div className={`${styles.card} ${styles.gridItemSmall}`} style={{ backgroundColor: "var(--ca-surface-2)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--ca-violet, #654fa7)", fontWeight: 700, fontSize: "0.875rem", marginBottom: "0.5rem" }}>
                  <UserCheck size={16} />
                  <span>5. Human Oversight</span>
                </div>
                <p style={{ fontSize: "0.8125rem", color: "var(--ca-text-secondary)", margin: 0 }}>
                  Staff can pause AI, take over, or resume automation anytime.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
