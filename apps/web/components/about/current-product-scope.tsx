import { ButtonLink } from "@/components/button-link";
import { Grid, MessageSquare, Database, Bot, Wrench } from "lucide-react";
import styles from "./about.module.css";

export function CurrentProductScope() {
  const groups = [
    {
      icon: <MessageSquare size={20} />,
      title: "Conversations",
      link: "/features",
      text: "AI auto-replies, voice note and image understanding, reply modes, and human pause/resume controls.",
    },
    {
      icon: <Database size={20} />,
      title: "Customer Operations",
      link: "/features",
      text: "Customer 360 profiles, CRM pipelines, workspace order records, updates, and automated follow-ups.",
    },
    {
      icon: <Bot size={20} />,
      title: "Content & Automation",
      link: "/features",
      text: "Product catalog formatting, saved media groups, reusable response templates, and welcome sequences.",
    },
    {
      icon: <Wrench size={20} />,
      title: "Integrations & Billing",
      link: "/integrations",
      text: "WooCommerce catalog details, PostEx & Leopards courier tracking, REST API endpoints, webhooks, and wallet visibility.",
    },
  ];

  return (
    <section id="scope" className={styles.section}>
      <div className={styles.header}>
        <div className={styles.eyebrow}>
          <Grid size={14} /> Practical Capabilities
        </div>
        <h2 className={styles.title}>Current Product Scope</h2>
        <p className={styles.subtitle}>
          Explore the key operational areas supported in the active BlackArrow platform.
        </p>
      </div>

      <div className={styles.cardGrid}>
        {groups.map((grp) => (
          <div key={grp.title} className={styles.card}>
            <div className={styles.cardIcon}>{grp.icon}</div>
            <h3 className={styles.cardTitle}>{grp.title}</h3>
            <p className={styles.cardText}>{grp.text}</p>
            <div style={{ marginTop: "auto", paddingTop: "0.5rem" }}>
              <ButtonLink href={grp.link} variant="secondary" showArrow>
                Explore Details
              </ButtonLink>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
