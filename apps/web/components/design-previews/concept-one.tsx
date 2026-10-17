import styles from "./design-preview.module.css";
import { PreviewActionRow, PreviewFaqList, PreviewPricingTeaser, PreviewProductMockup } from "./preview-mockups";
import { PREVIEW_BENEFITS, PREVIEW_FAQS, PREVIEW_PRICING_TEASER, PREVIEW_WORKFLOW } from "./preview-sections";

export function ConceptOne() {
  return (
    <div className={styles.previewPage}>
      <section className={`${styles.heroSection} ${styles.heroSectionWide}`}>
        <div className={styles.heroCopy}>
          <p className={styles.previewEyebrow}>BlackArrow</p>
          <h1>Premium WhatsApp automation for teams that need faster replies and cleaner operations</h1>
          <p className={styles.previewLead}>
            A product-led hero direction inspired by modern SaaS launch pages: larger type, a wider
            two-column layout, and one polished visual that explains the workflow above the fold.
          </p>
          <PreviewActionRow />
        </div>
        <PreviewProductMockup />
      </section>

      <section className={styles.previewSection}>
        <div className={styles.sectionHeading}>
          <p className={styles.previewEyebrow}>Product workflow</p>
          <h2>One visible flow from WhatsApp message to captured order and human handoff</h2>
        </div>
        <div className={styles.workflowPreviewGrid}>
          {PREVIEW_WORKFLOW.map(([title, body], index) => (
            <article key={title} className={styles.workflowPreviewCard}>
              <span>0{index + 1}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={`${styles.previewSection} ${styles.previewSectionMuted}`}>
        <div className={styles.sectionHeading}>
          <p className={styles.previewEyebrow}>Feature grid</p>
          <h2>Minimal cards, stronger hierarchy, less template repetition</h2>
        </div>
        <div className={styles.benefitGrid}>
          {PREVIEW_BENEFITS.map((item, index) => (
            <article key={item.title} className={`${styles.benefitCard} ${index === 0 ? styles.benefitCardAccent : ""}`}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.previewSection}>
        <div className={styles.sectionHeading}>
          <p className={styles.previewEyebrow}>Pricing teaser</p>
          <h2>Plans introduced cleanly without dragging the whole pricing page into the hero</h2>
        </div>
        <PreviewPricingTeaser plans={PREVIEW_PRICING_TEASER} />
      </section>

      <section className={`${styles.previewSection} ${styles.previewSectionLight}`}>
        <div className={styles.sectionHeading}>
          <p className={styles.previewEyebrow}>FAQ</p>
          <h2>Short answers that still feel premium and readable</h2>
        </div>
        <PreviewFaqList items={PREVIEW_FAQS} />
      </section>
    </div>
  );
}
