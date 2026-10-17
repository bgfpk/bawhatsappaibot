import { Eye, MessageSquare, Layers, ShieldCheck } from "lucide-react";
import styles from "./features.module.css";

const LAYERS = [
  {
    title: "1. Understand",
    icon: Eye,
    color: "var(--ca-blue, #425fa8)",
    items: ["Text inquiries & intents", "Supported product photos", "Supported voice notes", "Supported document attachments"],
  },
  {
    title: "2. Respond",
    icon: MessageSquare,
    color: "var(--ca-brand-strong, #24ad78)",
    items: ["Business-trained AI replies", "Product & service catalogs", "WordPress knowledge sync", "Media Groups & sequences"],
  },
  {
    title: "3. Organize",
    icon: Layers,
    color: "var(--ca-amber, #835607)",
    items: ["Customer 360 profiles", "6-stage CRM pipeline", "Order capture & summaries", "Scheduled follow-up reminders"],
  },
  {
    title: "4. Control",
    icon: ShieldCheck,
    color: "var(--ca-rose, #a94153)",
    items: ["1-click human takeover", "Per-chat AI pause/resume", "Itemized usage wallet logs", "Linked Devices diagnostics"],
  },
];

export function SystemSummarySection() {
  return (
    <section className={styles.section}>
      <div className={styles.container}>
        <div className={styles.sectionHeader}>
          <span className={styles.eyebrow}>Architecture Overview</span>
          <h2 className={styles.sectionTitle}>The Four Operational Layers of BlackArrow</h2>
          <p className={styles.sectionDesc}>
            A complete view of how message processing, knowledge responses, record organization, and staff oversight link into one system.
          </p>
        </div>

        <div className={styles.centeredGrid}>
          {LAYERS.map((layer) => {
            const Icon = layer.icon;
            return (
              <div key={layer.title} className={`${styles.card} ${styles.gridItem4}`} style={{ backgroundColor: "var(--ca-surface-2)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: layer.color, fontWeight: 800, fontSize: "1rem", marginBottom: "1rem", borderBottom: `2px solid ${layer.color}`, paddingBottom: "0.5rem" }}>
                  <Icon size={18} />
                  <span>{layer.title}</span>
                </div>
                <ul style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.8125rem", color: "var(--ca-text-secondary)", listStyle: "none", padding: 0, margin: 0 }}>
                  {layer.items.map((item) => (
                    <li key={item} style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                      <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: layer.color }} />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
