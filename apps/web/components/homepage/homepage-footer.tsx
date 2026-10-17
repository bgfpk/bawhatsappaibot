import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Mail, MessageCircle, FileText } from "lucide-react";
import { CURRENT_CTA_LINKS } from "@/lib/cta-links";
import styles from "./homepage.module.css";

export function HomepageFooter() {
  return (
    <footer id="final-cta" style={{ backgroundColor: "var(--ca-canvas-1)", borderTop: "1px solid var(--ca-border-subtle)" }}>
      {/* SECTION 12 — Final CTA Banner */}
      <div className={styles.section} style={{ borderBottom: "1px solid var(--ca-border-subtle)", paddingTop: "4.5rem", paddingBottom: "5rem" }}>
        <div className={styles.container}>
          <div
            className={styles.card}
            style={{
              maxWidth: "58rem",
              margin: "0 auto",
              textAlign: "center",
              padding: "3.5rem 2rem",
              background: "linear-gradient(135deg, var(--ca-surface-1) 0%, var(--ca-surface-2) 100%)",
              border: "1px solid var(--ca-border-strong)",
              borderRadius: "1.25rem",
              boxShadow: "0 20px 50px rgba(0, 0, 0, 0.2)",
            }}
          >
            <span className={`${styles.badge} ${styles.badgeBrand}`} style={{ marginBottom: "1.25rem", display: "inline-flex" }}>
              Start With One WhatsApp Workflow
            </span>

            <h2 style={{ fontSize: "clamp(1.875rem, 4vw, 2.75rem)", fontWeight: 800, color: "var(--ca-text-primary)", marginBottom: "1rem", lineHeight: 1.2 }}>
              Automate WhatsApp Sales, Support, Orders, and Follow-Ups
            </h2>

            <p style={{ fontSize: "1.0625rem", color: "var(--ca-text-secondary)", marginBottom: "2rem", maxWidth: "38rem", margin: "0 auto 2rem" }}>
              Includes a 7-day trial and $1 AI test credit. Connect via Linked Devices QR and let your team step in whenever needed.
            </p>

            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: "1rem" }}>
              <Link href={CURRENT_CTA_LINKS.startTrial} className={styles.btnPrimary} style={{ fontSize: "1rem", padding: "0.875rem 1.75rem" }}>
                <span>Start Free Trial</span>
                <ArrowRight size={16} />
              </Link>
              <Link href="/pricing" className={styles.btnSecondary} style={{ fontSize: "1rem", padding: "0.875rem 1.75rem" }}>
                <span>View Pricing</span>
              </Link>
              <Link href="/docs" className={styles.btnSecondary} style={{ fontSize: "1rem", padding: "0.875rem 1.75rem" }}>
                <FileText size={16} />
                <span>Read Documentation</span>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Main Footer Links Grid */}
      <div className={styles.container} style={{ paddingTop: "4rem", paddingBottom: "4rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "2.5rem" }}>
          {/* Col 1: Brand & Contact Info */}
          <div style={{ gridColumn: "span 1" }}>
            <Link href="/" className={styles.logoGroup} style={{ marginBottom: "1rem", display: "inline-flex" }}>
              <Image
                src="/brand/black-arrow-logo-dark.png"
                alt="BlackArrow"
                width={150}
                height={36}
                loading="lazy"
                decoding="async"
                className={styles.logoDark}
                style={{ height: "auto", width: "135px" }}
              />
              <Image
                src="/brand/black-arrow-logo-light.png"
                alt="BlackArrow"
                width={150}
                height={36}
                loading="lazy"
                decoding="async"
                className={styles.logoLight}
                style={{ height: "auto", width: "135px" }}
              />
            </Link>
            <p style={{ fontSize: "0.84375rem", color: "var(--ca-text-muted)", lineHeight: 1.6, maxWidth: "16rem", marginBottom: "1rem" }}>
              Automate WhatsApp sales, customer support, order detail capture, and follow-ups while staff stays in control.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", fontSize: "0.8125rem", color: "var(--ca-text-secondary)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <Mail size={14} style={{ color: "var(--ca-brand)" }} />
                <a href="mailto:contact-086473cbd844@example.invalid" style={{ color: "inherit", textDecoration: "none" }}>contact-086473cbd844@example.invalid</a>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <MessageCircle size={14} style={{ color: "var(--ca-brand)" }} />
                <Link href="/contact" style={{ color: "inherit", textDecoration: "none" }}>WhatsApp Sales Desk</Link>
              </div>
            </div>
          </div>

          {/* Col 2: Product */}
          <div>
            <h3 style={{ fontSize: "0.84375rem", fontWeight: 700, color: "var(--ca-text-primary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "1rem" }}>
              Product
            </h3>
            <ul style={{ display: "flex", flexDirection: "column", gap: "0.625rem", fontSize: "0.84375rem", padding: 0, margin: 0, listStyle: "none" }}>
              <li><Link href="/features" className={styles.navLink}>Features</Link></li>
              <li><Link href="/pricing" className={styles.navLink}>Pricing</Link></li>
              <li><Link href="/integrations" className={styles.navLink}>Integrations</Link></li>
              <li><Link href="/docs" className={styles.navLink}>Documentation</Link></li>
            </ul>
          </div>

          {/* Col 3: Solutions */}
          <div>
            <h3 style={{ fontSize: "0.84375rem", fontWeight: 700, color: "var(--ca-text-primary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "1rem" }}>
              Solutions
            </h3>
            <ul style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.8125rem", padding: 0, margin: 0, listStyle: "none" }}>
              <li><Link href="/whatsapp-automation" className={styles.navLink}>WhatsApp Automation</Link></li>
              <li><Link href="/ai-whatsapp-bot" className={styles.navLink}>AI WhatsApp Bot</Link></li>
              <li><Link href="/whatsapp-customer-support" className={styles.navLink}>WhatsApp Support</Link></li>
              <li><Link href="/ecommerce-whatsapp-bot" className={styles.navLink}>Ecommerce WhatsApp Bot</Link></li>
              <li><Link href="/whatsapp-order-capture" className={styles.navLink}>WhatsApp Order Capture</Link></li>
              <li><Link href="/whatsapp-automation-for-small-business" className={styles.navLink}>Small Business Automation</Link></li>
              <li><Link href="/whatsapp-ai-bot-for-ecommerce" className={styles.navLink}>Ecommerce AI Bot</Link></li>
              <li><Link href="/whatsapp-bot-pricing" className={styles.navLink}>WhatsApp Bot Pricing</Link></li>
              <li><Link href="/best-whatsapp-automation-tool" className={styles.navLink}>Best Automation Tool</Link></li>
              <li><Link href="/blackarrow-vs-manual-whatsapp-support" className={styles.navLink}>BlackArrow vs Manual Support</Link></li>
            </ul>
          </div>

          {/* Col 3B: Regional & Workflows */}
          <div>
            <h3 style={{ fontSize: "0.84375rem", fontWeight: 700, color: "var(--ca-text-primary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "1rem" }}>
              Workflows &amp; Local
            </h3>
            <ul style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.8125rem", padding: 0, margin: 0, listStyle: "none" }}>
              <li><Link href="/whatsapp-automation-pakistan" className={styles.navLink}>Pakistan Automation</Link></li>
              <li><Link href="/whatsapp-cod-order-automation" className={styles.navLink}>WhatsApp COD Automation</Link></li>
              <li><Link href="/whatsapp-order-tracking-automation" className={styles.navLink}>Order Tracking Bot</Link></li>
              <li><Link href="/whatsapp-human-handoff" className={styles.navLink}>Human Handoff Controls</Link></li>
              <li><Link href="/whatsapp-voice-note-automation" className={styles.navLink}>Voice Note Automation</Link></li>
              <li><Link href="/woocommerce-whatsapp-automation" className={styles.navLink}>WooCommerce Automation</Link></li>
              <li><Link href="/postex-whatsapp-integration" className={styles.navLink}>PostEx Integration</Link></li>
              <li><Link href="/leopards-whatsapp-integration" className={styles.navLink}>Leopards Integration</Link></li>
            </ul>
          </div>

          {/* Col 3C: Comparisons */}
          <div>
            <h3 style={{ fontSize: "0.84375rem", fontWeight: 700, color: "var(--ca-text-primary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "1rem" }}>
              Comparisons
            </h3>
            <ul style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.8125rem", padding: 0, margin: 0, listStyle: "none" }}>
              <li><Link href="/blackarrow-vs-wati" className={styles.navLink}>BlackArrow vs Wati</Link></li>
              <li><Link href="/blackarrow-vs-aisensy" className={styles.navLink}>BlackArrow vs AiSensy</Link></li>
              <li><Link href="/blackarrow-vs-interakt" className={styles.navLink}>BlackArrow vs Interakt</Link></li>
              <li><Link href="/whatsapp-api-vs-linked-devices" className={styles.navLink}>API vs Linked Devices</Link></li>
            </ul>
          </div>

          {/* Col 4: Company & Resources */}
          <div>
            <h3 style={{ fontSize: "0.84375rem", fontWeight: 700, color: "var(--ca-text-primary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "1rem" }}>
              Company
            </h3>
            <ul style={{ display: "flex", flexDirection: "column", gap: "0.625rem", fontSize: "0.84375rem", padding: 0, margin: 0, listStyle: "none" }}>
              <li><Link href="/about" className={styles.navLink}>About BlackArrow</Link></li>
              <li><Link href="/blog" className={styles.navLink}>Blog &amp; Updates</Link></li>
              <li><Link href="/contact" className={styles.navLink}>Contact Sales</Link></li>
            </ul>
          </div>

          {/* Col 5: Legal */}
          <div>
            <h3 style={{ fontSize: "0.84375rem", fontWeight: 700, color: "var(--ca-text-primary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "1rem" }}>
              Legal
            </h3>
            <ul style={{ display: "flex", flexDirection: "column", gap: "0.625rem", fontSize: "0.84375rem", padding: 0, margin: 0, listStyle: "none" }}>
              <li><Link href="/terms" className={styles.navLink}>Terms of Service</Link></li>
              <li><Link href="/privacy" className={styles.navLink}>Privacy Policy</Link></li>
              <li><Link href="/disclaimer" className={styles.navLink}>Compliance Disclaimer</Link></li>
            </ul>
          </div>
        </div>

        {/* Bottom Legal Row */}
        <div style={{ marginTop: "3.5rem", paddingTop: "1.5rem", borderTop: "1px solid var(--ca-border-subtle)", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "1rem", fontSize: "0.78125rem", color: "var(--ca-text-muted)" }}>
          <div>&copy; 2026 BlackArrow. All rights reserved.</div>
          <div>Clients remain responsible for safe, relevant and compliant WhatsApp usage.</div>
          <div style={{ width: "100%", fontSize: "0.75rem", color: "var(--ca-text-muted)", marginTop: "0.5rem" }}>
            BlackArrow is an independent software product and is not affiliated with or endorsed by WhatsApp or Meta Platforms, Inc.
          </div>
        </div>
      </div>
    </footer>
  );
}
