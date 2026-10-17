import styles from "./design-preview.module.css";
import { PreviewActionRow, PreviewPricingTeaser, PreviewProductMockup } from "./preview-mockups";
import {
  PREVIEW_BENEFITS,
  PREVIEW_PRICING_TEASER,
  PREVIEW_PROOF_POINTS,
  PREVIEW_USE_CASES,
  PREVIEW_WORKFLOW,
} from "./preview-sections";

export function ConceptThree() {
  return (
    <div className={styles.previewPage}>
      <section className={`${styles.heroSection} ${styles.heroSectionEnergetic}`}>
        <div className={styles.heroCopy}>
          <p className={styles.previewEyebrow}>BlackArrow</p>
          <h1>Turn busy WhatsApp demand into replies, captured orders, and cleaner follow-up</h1>
          <p className={styles.previewLead}>
            A higher-energy conversion concept with bigger mint gradients, a stronger trial CTA,
            and a product visual pushed closer to the first scroll decision.
          </p>
          <PreviewActionRow />
          <div className={styles.proofStrip}>
            {PREVIEW_PROOF_POINTS.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </div>
        <PreviewProductMockup energetic />
      </section>

      <section className={`${styles.previewSection} ${styles.previewSectionMuted}`}>
        <div className={styles.sectionHeading}>
          <p className={styles.previewEyebrow}>Benefits</p>
          <h2>Conversion-focused panels that still stay grounded in the real product story</h2>
        </div>
        <div className={styles.benefitGrid}>
          {PREVIEW_BENEFITS.map((item, index) => (
            <article key={item.title} className={`${styles.benefitCard} ${index === 1 ? styles.benefitCardAccent : ""}`}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.previewSection}>
        <div className={styles.sectionHeading}>
          <p className={styles.previewEyebrow}>How it works</p>
          <h2>A brighter, conversion-ready workflow block that still reads fast</h2>
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

      <section className={`${styles.previewSection} ${styles.previewSectionLight}`}>
        <div className={styles.sectionHeading}>
          <p className={styles.previewEyebrow}>Use cases</p>
          <h2>Proof through relevant business contexts instead of fake customer logos</h2>
        </div>
        <div className={styles.useCaseStrip}>
          {PREVIEW_USE_CASES.map((item) => (
            <span key={item} className={styles.useCaseChip}>
              {item}
            </span>
          ))}
        </div>
      </section>

      <section className={styles.previewSection}>
        <div className={styles.sectionHeading}>
          <p className={styles.previewEyebrow}>Pricing</p>
          <h2>Plans stay visible before the buyer falls off the page</h2>
        </div>
        <PreviewPricingTeaser plans={PREVIEW_PRICING_TEASER} />
      </section>

      <section className={`${styles.previewSection} ${styles.finalEnergyCta}`}>
        <p className={styles.previewEyebrow}>Final CTA</p>
        <h2>Start with one workflow, get the first replies right, then scale</h2>
        <p className={styles.previewLead}>
          This direction is built to feel more sales-focused while still preserving the real
          BlackArrow scope and SEO-safe content story.
        </p>
        <PreviewActionRow />
      </section>
    </div>
  );
}
