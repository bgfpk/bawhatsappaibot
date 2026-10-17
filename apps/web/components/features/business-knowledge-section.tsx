import { BookOpen, Package, Globe, Sliders, ArrowRight, ShieldCheck } from "lucide-react";
import styles from "./features.module.css";

export function BusinessKnowledgeSection() {
  return (
    <section id="business-knowledge" className={styles.section} style={{ backgroundColor: "var(--ca-canvas-1)" }}>
      <div className={styles.container}>
        <div className={styles.sectionHeader}>
          <span className={styles.eyebrow}>Grounded Knowledge Engine</span>
          <h2 className={styles.sectionTitle}>Business-Trained AI Replies from Configured Sources</h2>
          <p className={styles.sectionDesc}>
            BlackArrow generates answers using your specific business guidelines, products, operating policies, and synced website content.
          </p>
        </div>

        {/* Source-to-Response Visual */}
        <div className={styles.mockupShell} style={{ marginBottom: "2rem" }}>
          <div className={styles.mockupHeader}>
            <span>Source-to-Response Knowledge Mapping</span>
            <span className={`${styles.badge} ${styles.badgeBrand}`}>Grounded AI Replies</span>
          </div>

          <div className={styles.mockupBody}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.5rem", alignItems: "center" }}>
              {/* Left Column: Business Sources */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
                <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--ca-text-primary)", marginBottom: "0.25rem" }}>
                  Configured Business Sources
                </div>

                <div className={styles.card} style={{ padding: "1rem", backgroundColor: "var(--ca-surface-2)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--ca-brand-strong)", fontWeight: 600, fontSize: "0.875rem" }}>
                    <Sliders size={16} />
                    <span>Business Persona &amp; Tone Rules</span>
                  </div>
                  <p style={{ fontSize: "0.75rem", color: "var(--ca-text-secondary)", margin: "0.25rem 0 0" }}>
                    Polite, professional, or brand-tailored conversational guidelines.
                  </p>
                </div>

                <div className={styles.card} style={{ padding: "1rem", backgroundColor: "var(--ca-surface-2)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--ca-blue, #425fa8)", fontWeight: 600, fontSize: "0.875rem" }}>
                    <Package size={16} />
                    <span>Products &amp; Service Catalogs</span>
                  </div>
                  <p style={{ fontSize: "0.75rem", color: "var(--ca-text-secondary)", margin: "0.25rem 0 0" }}>
                    Item titles, prices, stock limits, variant attributes, and delivery terms.
                  </p>
                </div>

                <div className={styles.card} style={{ padding: "1rem", backgroundColor: "var(--ca-surface-2)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--ca-amber, #835607)", fontWeight: 600, fontSize: "0.875rem" }}>
                    <Globe size={16} />
                    <span>Website &amp; WordPress Content</span>
                  </div>
                  <p style={{ fontSize: "0.75rem", color: "var(--ca-text-secondary)", margin: "0.25rem 0 0" }}>
                    Synced FAQ pages, return policies, and service menus (where configured).
                  </p>
                </div>
              </div>

              {/* Right Column: Output WhatsApp Reply */}
              <div className={styles.card} style={{ backgroundColor: "var(--ca-surface-2)", borderColor: "var(--ca-brand)", padding: "1.25rem" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", paddingBottom: "0.5rem", borderBottom: "1px solid var(--ca-border-subtle)" }}>
                  <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--ca-brand-strong)" }}>WhatsApp Assistant Output</span>
                  <span className={styles.badge}>Grounded Match</span>
                </div>

                <div style={{ backgroundColor: "var(--ca-surface-1)", borderRadius: "0.625rem", padding: "0.875rem", fontSize: "0.8125rem", color: "var(--ca-text-primary)", lineHeight: 1.5, marginBottom: "0.75rem" }}>
                  &quot;Hello! The Leather Tote Bag is Rs. 4,500. Delivery to Gulberg, Lahore is Rs. 200 standard delivery. Total for 1 unit is Rs. 4,700 via Cash on Delivery. Would you like me to confirm this order?&quot;
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.75rem", color: "var(--ca-text-muted)" }}>
                  <ShieldCheck size={14} style={{ color: "var(--ca-brand-strong)" }} /> Matched against configured Product Catalog &amp; Shipping Policy
                </div>
              </div>
            </div>
          </div>
        </div>

        <p style={{ textAlign: "center", fontSize: "0.8125rem", color: "var(--ca-text-muted)", margin: 0 }}>
          Response quality depends directly on configured business information and operational instructions.
        </p>
      </div>
    </section>
  );
}
