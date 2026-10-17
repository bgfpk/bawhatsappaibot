import { MessageSquare, Image as ImageIcon, Mic, FileText, Cpu, CheckCircle2 } from "lucide-react";
import styles from "./features.module.css";

export function MultimodalSection() {
  return (
    <section id="ai-understanding" className={styles.section}>
      <div id="conversations" />
      <div className={styles.container}>
        <div className={styles.sectionHeader}>
          <span className={styles.eyebrow}>Multimodal AI Classification</span>
          <h2 className={styles.sectionTitle}>Understand Customer Messages Across Supported Formats</h2>
          <p className={styles.sectionDesc}>
            Customers communicate in various ways. BlackArrow processes incoming text, voice notes, photos, and document attachments to understand buyer intent.
          </p>
        </div>

        {/* Connected Visual: 4 Message Inputs -> 1 AI Layer */}
        <div className={styles.mockupShell} style={{ marginBottom: "2.5rem" }}>
          <div className={styles.mockupHeader}>
            <span>Multimodal Processing Pipeline</span>
            <span className={`${styles.badge} ${styles.badgeBrand}`}>Gemini Multimodal Engine</span>
          </div>

          <div className={styles.mockupBody}>
            <div className={styles.centeredGrid} style={{ marginBottom: "1.5rem" }}>
              {/* Input 1: Text */}
              <div className={`${styles.card} ${styles.gridItem4}`} style={{ backgroundColor: "var(--ca-surface-2)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--ca-brand-strong)", fontWeight: 700, fontSize: "0.9375rem", marginBottom: "0.5rem" }}>
                  <MessageSquare size={18} />
                  <span>Text Inquiries</span>
                </div>
                <p style={{ fontSize: "0.8125rem", color: "var(--ca-text-secondary)", margin: 0 }}>
                  Extracts product questions, pricing queries, delivery addresses, and customer intents.
                </p>
              </div>

              {/* Input 2: Photos */}
              <div className={`${styles.card} ${styles.gridItem4}`} style={{ backgroundColor: "var(--ca-surface-2)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--ca-blue, #425fa8)", fontWeight: 700, fontSize: "0.9375rem", marginBottom: "0.5rem" }}>
                  <ImageIcon size={18} />
                  <span>Supported Product Photos</span>
                </div>
                <p style={{ fontSize: "0.8125rem", color: "var(--ca-text-secondary)", margin: 0 }}>
                  Identifies item codes, color variants, and product images sent by buyers ($0.007/image).
                </p>
              </div>

              {/* Input 3: Voice Notes */}
              <div className={`${styles.card} ${styles.gridItem4}`} style={{ backgroundColor: "var(--ca-surface-2)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--ca-amber, #835607)", fontWeight: 700, fontSize: "0.9375rem", marginBottom: "0.5rem" }}>
                  <Mic size={18} />
                  <span>Supported Voice Notes</span>
                </div>
                <p style={{ fontSize: "0.8125rem", color: "var(--ca-text-secondary)", margin: 0 }}>
                  Transcribes and understands voice notes in supported languages ($0.010/voice note).
                </p>
              </div>

              {/* Input 4: Documents */}
              <div className={`${styles.card} ${styles.gridItem4}`} style={{ backgroundColor: "var(--ca-surface-2)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--ca-rose, #a94153)", fontWeight: 700, fontSize: "0.9375rem", marginBottom: "0.5rem" }}>
                  <FileText size={18} />
                  <span>Supported Documents</span>
                </div>
                <p style={{ fontSize: "0.8125rem", color: "var(--ca-text-secondary)", margin: 0 }}>
                  Parses attached PDF purchase orders, spec sheets, and receipt images where supported.
                </p>
              </div>
            </div>

            {/* Central Reasoning Box */}
            <div style={{ backgroundColor: "var(--ca-surface-3)", border: "1px solid var(--ca-brand)", borderRadius: "0.75rem", padding: "1.25rem", textAlign: "center" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", color: "var(--ca-brand-strong)", fontWeight: 700, fontSize: "0.9375rem", marginBottom: "0.35rem" }}>
                <Cpu size={20} />
                <span>Unified Multimodal Classification Layer</span>
              </div>
              <p style={{ fontSize: "0.8125rem", color: "var(--ca-text-secondary)", margin: 0, maxWidth: "38rem", marginLeft: "auto", marginRight: "auto" }}>
                Combines text, audio transcriptions, and image analysis into structured buyer context before consulting your business knowledge repository.
              </p>
            </div>
          </div>
        </div>

        {/* Factual qualifications list */}
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "1.5rem", fontSize: "0.8125rem", color: "var(--ca-text-muted)" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
            <CheckCircle2 size={14} style={{ color: "var(--ca-brand-strong)" }} /> Multimodal features apply where configured
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
            <CheckCircle2 size={14} style={{ color: "var(--ca-brand-strong)" }} /> Clear voice notes and high-resolution photos process best
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
            <CheckCircle2 size={14} style={{ color: "var(--ca-brand-strong)" }} /> Staff can review transcriptions anytime
          </span>
        </div>
      </div>
    </section>
  );
}
