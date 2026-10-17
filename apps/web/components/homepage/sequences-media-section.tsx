"use client";

import { Layers, FileText, Image as ImageIcon, Video, Send, Clock, Sparkles, CheckCircle2 } from "lucide-react";
import styles from "./homepage.module.css";

const SEQUENCE_STACK_ITEMS = [
  {
    type: "WELCOME SEQUENCE",
    trigger: "Customer First Inquiry",
    title: "1. Automated Store Introduction",
    detail: "Sends greeting message, store hours, and current catalog link.",
    time: "Immediate",
    rate: "$0.0005 / item",
  },
  {
    type: "MEDIA GROUP BUNDLE",
    trigger: "Product Detail Request",
    title: "2. Photo Bundle & Spec PDF",
    detail: "Delivers 4 high-res product photos + 2026 Catalog Brochure.pdf.",
    time: "1 sec delay",
    rate: "$0.001 / file",
  },
  {
    type: "KEYWORD SHORTCUT",
    trigger: "Customer types 'pricing'",
    title: "3. Itemized Price List & Options",
    detail: "Responds with exact itemized pricing breakdown & Cash on Delivery terms.",
    time: "Instant",
    rate: "$0.003 / reply",
  },
  {
    type: "SCHEDULED FOLLOW-UP",
    trigger: "Unconfirmed Order",
    title: "4. Follow-Up Update & Assistance",
    detail: "Checks if customer needs assistance completing their order.",
    time: "2 hours later",
    rate: "Scheduled",
  },
];

export function SequencesMediaSection() {
  return (
    <section id="sequences-media" className={styles.section} style={{ paddingTop: "4rem", paddingBottom: "4.5rem" }}>
      <div className={styles.container}>
        <div className={styles.sectionHeader} style={{ textAlign: "center", maxWidth: "48rem", margin: "0 auto 3.5rem" }}>
          <span className={styles.eyebrow}>WhatsApp Content Library &amp; Sequences</span>
          <h2 className={styles.sectionTitle} style={{ fontSize: "clamp(1.875rem, 3.5vw, 2.75rem)", fontWeight: 800 }}>
            Media Groups, PDF Catalogs, and Sequence Workflows
          </h2>
          <p className={styles.sectionDesc} style={{ fontSize: "1.0625rem", color: "var(--ca-text-secondary)", lineHeight: 1.6 }}>
            Organize reusable text shortcuts, PDF documents, photo groups, and welcome sequences into automated triggers.
          </p>
        </div>

        {/* Visual Sequence Stack Timeline */}
        <div
          style={{
            maxWidth: "54rem",
            margin: "0 auto 3rem",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
          }}
        >
          {SEQUENCE_STACK_ITEMS.map((item, idx) => (
            <div
              key={idx}
              className={styles.card}
              style={{
                padding: "1.25rem 1.5rem",
                backgroundColor: "var(--ca-surface-1)",
                borderRadius: "0.875rem",
                border: "1px solid var(--ca-border-subtle)",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "1rem",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
                  <span className={`${styles.badge} ${styles.badgeBrand}`} style={{ fontSize: "0.6875rem" }}>
                    {item.type}
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "var(--ca-text-muted)" }}>Trigger: {item.trigger}</span>
                </div>
                <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--ca-text-primary)", margin: "0 0 0.25rem 0" }}>
                  {item.title}
                </h3>
                <p style={{ fontSize: "0.8125rem", color: "var(--ca-text-secondary)", margin: 0, lineHeight: 1.4 }}>
                  {item.detail}
                </p>
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.78125rem", color: "var(--ca-text-muted)" }}>
                  <Clock size={14} style={{ color: "var(--ca-brand)" }} />
                  <span>{item.time}</span>
                </div>
                <span className={styles.badge} style={{ backgroundColor: "var(--ca-surface-2)", color: "var(--ca-text-primary)", fontSize: "0.75rem" }}>
                  {item.rate}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Content Type Features Cards */}
        <div className={styles.centeredFlexGrid}>
          <div className={`${styles.card} ${styles.centeredFlexItem3}`} style={{ backgroundColor: "var(--ca-surface-1)", padding: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--ca-brand-strong)", fontWeight: 700, marginBottom: "0.5rem" }}>
              <Layers size={18} />
              <span>Media Group Bundles</span>
            </div>
            <p style={{ fontSize: "0.8125rem", color: "var(--ca-text-secondary)", lineHeight: 1.5, margin: 0 }}>
              Group product images, demonstration videos, and spec sheets into reusable multi-media bundles ($0.001/file).
            </p>
          </div>

          <div className={`${styles.card} ${styles.centeredFlexItem3}`} style={{ backgroundColor: "var(--ca-surface-1)", padding: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--ca-brand-strong)", fontWeight: 700, marginBottom: "0.5rem" }}>
              <FileText size={18} />
              <span>PDF Catalogs &amp; Documents</span>
            </div>
            <p style={{ fontSize: "0.8125rem", color: "var(--ca-text-secondary)", lineHeight: 1.5, margin: 0 }}>
              Deliver PDF price lists, service menus, and booking terms directly in native WhatsApp format.
            </p>
          </div>

          <div className={`${styles.card} ${styles.centeredFlexItem3}`} style={{ backgroundColor: "var(--ca-surface-1)", padding: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--ca-brand-strong)", fontWeight: 700, marginBottom: "0.5rem" }}>
              <Clock size={18} />
              <span>Sequence Timelines</span>
            </div>
            <p style={{ fontSize: "0.8125rem", color: "var(--ca-text-secondary)", lineHeight: 1.5, margin: 0 }}>
              Set automated delay timelines for welcome flows and follow-up updates ($0.0005/sequence item).
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
