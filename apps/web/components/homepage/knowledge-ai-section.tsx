"use client";

import {
  Brain,
  MessageSquare,
  Mic,
  Image as ImageIcon,
  FileText,
  Globe,
  Sparkles,
  ArrowDown,
  CheckCircle2,
  Cpu,
  Send,
} from "lucide-react";
import styles from "./homepage.module.css";

const KNOWLEDGE_SOURCES = [
  { icon: FileText, title: "Business Instructions", desc: "FAQs, store rules, opening hours, delivery terms, and refund policy." },
  { icon: Sparkles, title: "Products & Services", desc: "Catalog specifications, pricing variants, stock status, and item details." },
  { icon: Globe, title: "Website Knowledge", desc: "Indexed public pages and WordPress content where configured." },
  { icon: ImageIcon, title: "Image Understanding", desc: "Identifies product photos, styles, and payment receipts sent by customers." },
  { icon: Mic, title: "Voice Notes", desc: "Transcribes and extracts intent from customer WhatsApp audio notes." },
  { icon: FileText, title: "Documents & Specs", desc: "PDF price lists, brochures, and technical data sheets." },
  { icon: MessageSquare, title: "Language & Tone Rules", desc: "Matches store tone, formality level, and language preference." },
];

export function KnowledgeAiSection() {
  return (
    <section id="knowledge-ai" className={styles.section} style={{ paddingTop: "4rem", paddingBottom: "4.5rem" }}>
      <div className={styles.container}>
        <div className={styles.sectionHeader} style={{ textAlign: "center", maxWidth: "48rem", margin: "0 auto 3.5rem" }}>
          <span className={styles.eyebrow}>Business Knowledge &amp; Multimodal AI</span>
          <h2 className={styles.sectionTitle} style={{ fontSize: "clamp(1.875rem, 3.5vw, 2.75rem)", fontWeight: 800 }}>
            Source-to-Response Intelligence Architecture
          </h2>
          <p className={styles.sectionDesc} style={{ fontSize: "1.0625rem", color: "var(--ca-text-secondary)", lineHeight: 1.6 }}>
            The AI assistant reasons strictly over your business instructions, catalog, and policies to deliver grounded customer replies.
          </p>
        </div>

        {/* Source to Response Diagram */}
        <div
          style={{
            maxWidth: "60rem",
            margin: "0 auto 4rem",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "1.5rem",
          }}
        >
          {/* Layer 1: Knowledge Sources Grid */}
          <div style={{ width: "100%" }}>
            <div style={{ textAlign: "center", fontSize: "0.8125rem", fontWeight: 700, color: "var(--ca-brand-strong)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "1rem" }}>
              1. Business Knowledge Sources
            </div>
            <div className={styles.centeredFlexGrid}>
              {KNOWLEDGE_SOURCES.map((source, i) => {
                const Icon = source.icon;
                return (
                  <div
                    key={i}
                    className={`${styles.card} ${styles.centeredFlexItemSmall}`}
                    style={{
                      padding: "1rem",
                      backgroundColor: "var(--ca-surface-1)",
                      borderRadius: "0.75rem",
                      border: "1px solid var(--ca-border-subtle)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--ca-brand-strong)", fontWeight: 700, fontSize: "0.875rem", marginBottom: "0.35rem" }}>
                      <Icon size={16} />
                      <span>{source.title}</span>
                    </div>
                    <p style={{ fontSize: "0.78125rem", color: "var(--ca-text-secondary)", lineHeight: 1.4, margin: 0 }}>
                      {source.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Arrow Connector */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--ca-brand)" }}>
            <ArrowDown size={24} />
          </div>

          {/* Layer 2: Reasoning Layer */}
          <div
            className={styles.card}
            style={{
              width: "100%",
              maxWidth: "40rem",
              padding: "1.25rem",
              backgroundColor: "rgba(50, 207, 145, 0.08)",
              border: "1px solid rgba(50, 207, 145, 0.3)",
              borderRadius: "0.875rem",
              textAlign: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", color: "var(--ca-brand-strong)", fontWeight: 800, fontSize: "1rem", marginBottom: "0.35rem" }}>
              <Cpu size={20} />
              <span>2. BlackArrow Reasoning Layer</span>
            </div>
            <p style={{ fontSize: "0.84375rem", color: "var(--ca-text-secondary)", lineHeight: 1.5, margin: 0 }}>
              Matches incoming customer intent against business rules, policy bounds, and store catalog data.
            </p>
          </div>

          {/* Arrow Connector */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--ca-brand)" }}>
            <ArrowDown size={24} />
          </div>

          {/* Layer 3: Output Action */}
          <div
            className={styles.card}
            style={{
              width: "100%",
              maxWidth: "40rem",
              padding: "1.25rem",
              backgroundColor: "var(--ca-surface-1)",
              border: "1px solid var(--ca-border-subtle)",
              borderRadius: "0.875rem",
              textAlign: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", color: "var(--ca-text-primary)", fontWeight: 800, fontSize: "1rem", marginBottom: "0.35rem" }}>
              <Send size={18} style={{ color: "var(--ca-brand)" }} />
              <span>3. Customer Reply &amp; Business Action</span>
            </div>
            <p style={{ fontSize: "0.84375rem", color: "var(--ca-text-secondary)", lineHeight: 1.5, margin: 0 }}>
              Delivers grounded text or voice reply, extracts order records, and updates customer CRM status.
            </p>
          </div>
        </div>

        {/* Itemized Multimodal Action Rates */}
        <div className={styles.centeredFlexGrid} style={{ maxWidth: "60rem", margin: "0 auto" }}>
          <div className={`${styles.card} ${styles.centeredFlexItem3}`} style={{ backgroundColor: "var(--ca-surface-1)", padding: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--ca-brand-strong)", fontWeight: 700, marginBottom: "0.35rem" }}>
              <MessageSquare size={18} />
              <span>Text Replies</span>
            </div>
            <p style={{ fontSize: "0.8125rem", color: "var(--ca-text-secondary)", marginBottom: "0.625rem" }}>
              Grounded AI answers using configured prompt rules.
            </p>
            <span className={`${styles.badge} ${styles.badgeBrand}`}>$0.003 / reply</span>
          </div>

          <div className={`${styles.card} ${styles.centeredFlexItem3}`} style={{ backgroundColor: "var(--ca-surface-1)", padding: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--ca-brand-strong)", fontWeight: 700, marginBottom: "0.35rem" }}>
              <Mic size={18} />
              <span>Voice Note Understanding</span>
            </div>
            <p style={{ fontSize: "0.8125rem", color: "var(--ca-text-secondary)", marginBottom: "0.625rem" }}>
              Transcribes and understands WhatsApp audio messages.
            </p>
            <span className={`${styles.badge} ${styles.badgeBrand}`}>$0.010 / voice note</span>
          </div>

          <div className={`${styles.card} ${styles.centeredFlexItem3}`} style={{ backgroundColor: "var(--ca-surface-1)", padding: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--ca-brand-strong)", fontWeight: 700, marginBottom: "0.35rem" }}>
              <ImageIcon size={18} />
              <span>Image Understanding</span>
            </div>
            <p style={{ fontSize: "0.8125rem", color: "var(--ca-text-secondary)", marginBottom: "0.625rem" }}>
              Processes product photos and payment screenshots sent in chat.
            </p>
            <span className={`${styles.badge} ${styles.badgeBrand}`}>$0.007 / image</span>
          </div>
        </div>
      </div>
    </section>
  );
}
