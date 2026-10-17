import { Folder, Image as ImageIcon, Video, FileText, Send } from "lucide-react";
import styles from "./features.module.css";

export function MediaGroupsSection() {
  return (
    <section id="media-sequences" className={styles.section} style={{ backgroundColor: "var(--ca-canvas-1)" }}>
      <div className={styles.container}>
        <div className={styles.sectionHeader}>
          <span className={styles.eyebrow}>Reusable Media Libraries</span>
          <h2 className={styles.sectionTitle}>Organize &amp; Deliver Saved Media Content on Demand</h2>
          <p className={styles.sectionDesc}>
            Save product image sets, demonstration videos, PDF brochures, and document files into Media Groups ready for instant customer requests.
          </p>
        </div>

        {/* Media Library Visual */}
        <div className={styles.mockupShell}>
          <div className={styles.mockupHeader}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Folder size={16} style={{ color: "var(--ca-brand)" }} />
              <span>Configured Media Groups &amp; Assets</span>
            </div>
            <span className={styles.badge}>$0.001/file send rate</span>
          </div>

          <div className={styles.mockupBody}>
            <div className={styles.centeredGrid}>
              <div className={`${styles.card} ${styles.gridItem4}`} style={{ backgroundColor: "var(--ca-surface-2)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--ca-brand-strong)", fontWeight: 700, fontSize: "0.875rem", marginBottom: "0.5rem" }}>
                  <ImageIcon size={18} />
                  <span>Product Image Bundles</span>
                </div>
                <p style={{ fontSize: "0.8125rem", color: "var(--ca-text-secondary)", margin: 0 }}>
                  High-res product photo sets sent in native WhatsApp photo formats upon buyer request.
                </p>
              </div>

              <div className={`${styles.card} ${styles.gridItem4}`} style={{ backgroundColor: "var(--ca-surface-2)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--ca-blue, #425fa8)", fontWeight: 700, fontSize: "0.875rem", marginBottom: "0.5rem" }}>
                  <Video size={18} />
                  <span>Demonstration Videos</span>
                </div>
                <p style={{ fontSize: "0.8125rem", color: "var(--ca-text-secondary)", margin: 0 }}>
                  Short product walkthroughs and usage clips delivered directly in customer chat streams.
                </p>
              </div>

              <div className={`${styles.card} ${styles.gridItem4}`} style={{ backgroundColor: "var(--ca-surface-2)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--ca-amber, #835607)", fontWeight: 700, fontSize: "0.875rem", marginBottom: "0.5rem" }}>
                  <FileText size={18} />
                  <span>PDF Price Lists &amp; Catalogs</span>
                </div>
                <p style={{ fontSize: "0.8125rem", color: "var(--ca-text-secondary)", margin: 0 }}>
                  PDF catalogs, service price lists, and booking guidelines sent formatted for instant viewing.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
