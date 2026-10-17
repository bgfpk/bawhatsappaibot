import React from "react";
import { CreditCard, Wallet, Check, AlertCircle } from "lucide-react";
import styles from "./docs.module.css";

export function WalletBillingGuide() {
  return (
    <section id="wallet-billing" className={styles.section}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.eyebrow}>
            <CreditCard size={14} /> Plans &amp; Wallet Guide
          </div>
          <h2 className={styles.title}>Subscriptions, Wallet &amp; Usage Rates</h2>
          <p className={styles.subtitle}>
            Understand how monthly subscription plans, optional services, and metered usage rates operate separately in BlackArrow.
          </p>
        </div>

        {/* Subscription Plans */}
        <div className={styles.pricingCardsGrid}>
          <div className={styles.miniPriceCard}>
            <div className={styles.priceTitle}>Starter</div>
            <div className={styles.priceValue}>$9 <span className={styles.priceUnit}>/mo</span></div>
            <ul className={styles.priceList}>
              <li><Check size={16} className={styles.checkIcon} /> Core WhatsApp workspace plan</li>
              <li><Check size={16} className={styles.checkIcon} /> 7-day trial with $1 AI credit</li>
              <li><Check size={16} className={styles.checkIcon} /> Standard AI response features</li>
            </ul>
          </div>

          <div className={`${styles.miniPriceCard} ${styles.miniPriceCardPopular}`}>
            <div className={styles.priceTitle}>Growth <span className={styles.categoryBadge} style={{ marginLeft: "0.5rem" }}>Popular</span></div>
            <div className={styles.priceValue}>$29 <span className={styles.priceUnit}>/mo</span></div>
            <ul className={styles.priceList}>
              <li><Check size={16} className={styles.checkIcon} /> Growth WhatsApp workspace plan</li>
              <li><Check size={16} className={styles.checkIcon} /> 7-day trial with $1 AI credit</li>
              <li><Check size={16} className={styles.checkIcon} /> Expanded workspace operations</li>
            </ul>
          </div>

          <div className={styles.miniPriceCard}>
            <div className={styles.priceTitle}>Pro</div>
            <div className={styles.priceValue}>$89 <span className={styles.priceUnit}>/mo</span></div>
            <ul className={styles.priceList}>
              <li><Check size={16} className={styles.checkIcon} /> Pro WhatsApp workspace plan</li>
              <li><Check size={16} className={styles.checkIcon} /> 7-day trial with $1 AI credit</li>
              <li><Check size={16} className={styles.checkIcon} /> High-volume workspace capacity</li>
            </ul>
          </div>
        </div>

        {/* Metered Usage Rates Table */}
        <div className={styles.visualBox} style={{ marginTop: "2.5rem" }}>
          <h3 className={styles.title} style={{ fontSize: "1.35rem", marginBottom: "0.5rem" }}>
            Metered Usage Rates (Deducted from Wallet)
          </h3>
          <p className={styles.subtitle} style={{ marginBottom: "1.25rem" }}>
            Minimum wallet top-up: $5. Optional Full Setup Service: $49.
          </p>

          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Usage Item</th>
                  <th>Exact Approved Rate</th>
                  <th>Billing Rule</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>AI text</strong></td>
                  <td><code>$0.003</code> per reply</td>
                  <td>Deducted when AI generates a text answer for an incoming customer message.</td>
                </tr>
                <tr>
                  <td><strong>Image</strong></td>
                  <td><code>$0.007</code> per image</td>
                  <td>Deducted when AI processes an incoming customer image.</td>
                </tr>
                <tr>
                  <td><strong>Voice note</strong></td>
                  <td><code>$0.010</code> per voice note</td>
                  <td>Deducted when processing incoming customer voice audio transcription.</td>
                </tr>
                <tr>
                  <td><strong>Generated voice</strong></td>
                  <td>from <code>$0.020</code> per reply</td>
                  <td>Deducted for generating outgoing audio voice note responses.</td>
                </tr>
                <tr>
                  <td><strong>Sequence or template</strong></td>
                  <td><code>$0.0005</code> per item</td>
                  <td>Deducted per item when an automated sequence or template step is dispatched.</td>
                </tr>
                <tr>
                  <td><strong>Media file</strong></td>
                  <td><code>$0.001</code> per file</td>
                  <td>Deducted per file when media assets are sent in conversation.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className={styles.infoBox}>
          <AlertCircle className={styles.infoIcon} size={22} />
          <div>
            <div className={styles.infoTitle}>Subscription Plan vs. Metered Usage Notice</div>
            <div className={styles.infoText}>
              Subscription fees and metered usage charges apply separately. Monthly plan fees cover your workspace dashboard access.
              Metered usage charges are deducted from your wallet balance per item. Minimum wallet top-up is $5. All plans include a 7-day trial with $1 AI credit. Optional Full Setup Service is available for $49.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
