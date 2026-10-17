import React from "react";
import { UserCheck, Smartphone, QrCode, Cpu, Database, CheckCircle2, Wallet, ShieldAlert, Zap } from "lucide-react";
import styles from "./docs.module.css";

export const QUICK_START_STEPS = [
  {
    num: "1",
    icon: <UserCheck size={20} />,
    title: "Account Access",
    desc: "Create your BlackArrow workspace account or sign in to your existing team workspace.",
  },
  {
    num: "2",
    icon: <Smartphone size={20} />,
    title: "Create WhatsApp Instance",
    desc: "In your workspace dashboard, create a new WhatsApp instance for your business phone number.",
  },
  {
    num: "3",
    icon: <Smartphone size={20} />,
    title: "Open WhatsApp Linked Devices",
    desc: "On your physical business phone, open WhatsApp > Settings or Menu > Linked Devices > Link a Device.",
  },
  {
    num: "4",
    icon: <QrCode size={20} />,
    title: "Scan Displayed QR Code",
    desc: "On your phone, open WhatsApp, go to Linked Devices, choose Link a Device, and use the WhatsApp scanner to scan the QR code displayed in BlackArrow.",
  },
  {
    num: "5",
    icon: <Cpu size={20} />,
    title: "Configure Business & AI Rules",
    desc: "Set your business type, AI persona, language preference, tone, and specific business instructions.",
  },
  {
    num: "6",
    icon: <Database size={20} />,
    title: "Add Products & Knowledge",
    desc: "Add product catalog items, custom confirmation fields, saved media groups, or automated response sequences.",
  },
  {
    num: "7",
    icon: <CheckCircle2 size={20} />,
    title: "Test Bot in Trial Chat",
    desc: "Send test messages from another WhatsApp number to review reply quality, business information, media responses, and staff takeover behaviour where configured.",
  },
  {
    num: "8",
    icon: <Wallet size={20} />,
    title: "Review Wallet & Controls",
    desc: "Confirm your wallet balance, check metered usage rates, and train staff on human takeover and AI pause controls.",
  },
];

export function QuickStartJourney() {
  return (
    <section id="quick-setup" className={`${styles.section} ${styles.sectionMuted}`}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.eyebrow}>
            <Zap size={14} /> Quick Setup Journey
          </div>
          <h2 className={styles.title}>Get Started in 8 Step-by-Step Actions</h2>
          <p className={styles.subtitle}>
            Follow this clear rollout path to connect your WhatsApp instance safely, configure AI guidance,
            and prepare your team for live customer conversations.
          </p>
        </div>

        <div className={styles.setupGrid}>
          {QUICK_START_STEPS.map((step) => (
            <div key={step.num} className={styles.stepCard}>
              <div className={styles.stepHeader}>
                <span className={styles.stepNumber}>{step.num}</span>
                <span className={styles.stepIcon}>{step.icon}</span>
              </div>
              <h3 className={styles.stepTitle}>{step.title}</h3>
              <p className={styles.stepDesc}>{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
