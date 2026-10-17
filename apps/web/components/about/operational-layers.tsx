import { Layers, Eye, MessageSquare, Database, ShieldAlert } from "lucide-react";
import styles from "./about.module.css";

export function OperationalLayers() {
  const layers = [
    {
      badge: "Layer 1",
      title: "Understand",
      icon: <Eye size={20} />,
      desc: "Processes supported customer text messages, voice notes, image attachments, and document uploads to identify customer intent.",
    },
    {
      badge: "Layer 2",
      title: "Respond",
      icon: <MessageSquare size={20} />,
      desc: "Generates grounded AI replies using configured business information, product catalogs, saved media groups, and automated response sequences.",
    },
    {
      badge: "Layer 3",
      title: "Organize",
      icon: <Database size={20} />,
      desc: "Maintains customer 360 profiles, CRM pipelines, workspace order records, scheduled follow-ups, and customer updates.",
    },
    {
      badge: "Layer 4",
      title: "Control",
      icon: <ShieldAlert size={20} />,
      desc: "Provides human takeover capabilities, instant AI pause and resume controls, usage visibility, and admin oversight.",
    },
  ];

  return (
    <section id="architecture" className={`${styles.section} ${styles.sectionMuted}`}>
      <div className={styles.header}>
        <div className={styles.eyebrow}>
          <Layers size={14} /> Four Operational Layers
        </div>
        <h2 className={styles.title}>What BlackArrow Brings Together</h2>
        <p className={styles.subtitle}>
          BlackArrow bridges conversational messaging and backend business operations through four structured functional layers.
        </p>
      </div>

      <div className={styles.layerGrid}>
        {layers.map((layer) => (
          <div key={layer.title} className={styles.layerCard}>
            <div className={styles.layerBadge}>{layer.badge}</div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <div className={styles.cardIcon}>{layer.icon}</div>
              <h3 className={styles.cardTitle}>{layer.title}</h3>
            </div>
            <p className={styles.cardText}>{layer.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
