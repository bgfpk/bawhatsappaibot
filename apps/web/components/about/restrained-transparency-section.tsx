import { ShieldCheck, XCircle } from "lucide-react";
import styles from "./about.module.css";

export function RestrainedTransparencySection() {
  const unclaimed = [
    "No official Meta or WhatsApp partnership claim; BlackArrow is an independent software platform.",
    "No guaranteed sales, revenue increases, or conversion rate promises.",
    "No zero-ban guarantee or claim of immunity from WhatsApp terms enforcement.",
    "No claim that every third-party integration works without user configuration or API keys.",
    "No claim that AI automation completely replaces staff oversight or business decision-making.",
  ];

  return (
    <section id="transparency" className={`${styles.section} ${styles.sectionMuted}`}>
      <div className={styles.header}>
        <div className={styles.eyebrow}>
          <ShieldCheck size={14} /> Honest Boundaries
        </div>
        <h2 className={styles.title}>What BlackArrow Does Not Claim</h2>
        <p className={styles.subtitle}>
          We maintain clear public communication regarding our software capabilities, platform status, and operational bounds.
        </p>
      </div>

      <div className={styles.card} style={{ maxWidth: "880px", margin: "0 auto" }}>
        <ul className={styles.list}>
          {unclaimed.map((item, i) => (
            <li key={i} className={styles.listItem}>
              <XCircle size={18} style={{ color: "var(--ca-text-muted)", flexShrink: 0, marginTop: "0.15rem" }} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
