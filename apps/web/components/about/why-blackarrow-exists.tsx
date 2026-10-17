import { HelpCircle, AlertCircle, FileText, CheckCircle2 } from "lucide-react";
import styles from "./about.module.css";

export function WhyBlackArrowExists() {
  const problems = [
    {
      icon: <AlertCircle size={20} />,
      title: "Unmanaged Conversation Volume",
      text: "As WhatsApp customer inquiries scale, response times slow down, and customer messages easily get lost in chat histories.",
    },
    {
      icon: <FileText size={20} />,
      title: "Scattered Business & Product Info",
      text: "Product details, catalog pricing, and return policies remain stored across scattered documents, leading to inconsistency.",
    },
    {
      icon: <CheckCircle2 size={20} />,
      title: "Automation Without Supervision Risk",
      text: "Generic chatbots without strict business boundaries produce inaccurate answers, while total manual handling drains capacity.",
    },
  ];

  return (
    <section id="why-blackarrow" className={styles.section}>
      <div className={styles.header}>
        <div className={styles.eyebrow}>
          <HelpCircle size={14} /> The Operational Problem
        </div>
        <h2 className={styles.title}>Why BlackArrow Exists</h2>
        <p className={styles.subtitle}>
          Businesses that manage customer conversations through WhatsApp can face operational bottlenecks as message volume grows.
        </p>
      </div>

      <div className={styles.cardGrid}>
        {problems.map((prob, i) => (
          <div key={i} className={styles.card}>
            <div className={styles.cardIcon}>{prob.icon}</div>
            <h3 className={styles.cardTitle}>{prob.title}</h3>
            <p className={styles.cardText}>{prob.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
