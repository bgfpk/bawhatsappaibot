import { Clock } from "lucide-react";
import styles from "./contact.module.css";

export function WhatHappensNext() {
  const steps = [
    {
      num: "1",
      title: "Request Received",
      desc: "Your email inquiry is received at contact-086473cbd844@example.invalid with your topic details.",
    },
    {
      num: "2",
      title: "Context Evaluated",
      desc: "Your message volume requirements, technical setup question, or billing inquiry is reviewed.",
    },
    {
      num: "3",
      title: "Direct Reply Sent",
      desc: "You receive a direct email reply with next steps, relevant setup documentation, or answers to your questions.",
    },
  ];

  return (
    <section id="what-happens-next" className={styles.section}>
      <div className={styles.header}>
        <div className={styles.eyebrow}>
          <Clock size={14} /> Inquiry Process
        </div>
        <h2 className={styles.title}>What Happens After You Email</h2>
        <p className={styles.subtitle}>
          Inquiries are handled in a structured, transparent process.
        </p>
      </div>

      <div className={styles.lifecycleGrid}>
        {steps.map((step) => (
          <div key={step.num} className={styles.lifecycleStep}>
            <div className={styles.stepNum}>{step.num}</div>
            <h3 className={styles.stepTitle}>{step.title}</h3>
            <p className={styles.stepDesc}>{step.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
