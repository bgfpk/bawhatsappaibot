import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CURRENT_CTA_LINKS } from "@/lib/cta-links";
import styles from "./features.module.css";

export function FeaturesCta() {
  return (
    <section className={styles.section} style={{ backgroundColor: "var(--ca-canvas-1)", borderBottom: "none" }}>
      <div className={styles.container}>
        <div style={{ backgroundColor: "var(--ca-surface-1)", border: "1px solid var(--ca-border)", borderRadius: "1rem", padding: "3.5rem 2rem", textAlign: "center", maxWidth: "52rem", margin: "0 auto" }}>
          <span className={styles.eyebrow}>Ready to Streamline WhatsApp Operations?</span>
          <h2 className={styles.sectionTitle} style={{ fontSize: "clamp(1.75rem, 3vw, 2.5rem)", marginBottom: "1rem" }}>
            Bring Your WhatsApp Sales and Support Workflow Into One Workspace
          </h2>
          <p className={styles.sectionDesc} style={{ maxWidth: "38rem", margin: "0 auto 2rem" }}>
            Start with clear business information, process customer messages across text, voice, and media, and let your team step in whenever needed.
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

          <p style={{ fontSize: "0.8125rem", color: "var(--ca-text-muted)", marginTop: "1.5rem", marginBottom: 0 }}>
            Includes a 7-day trial and $1 AI test credit. Connects via Linked Devices QR pairing.
          </p>
        </div>
      </div>
    </section>
  );
}
