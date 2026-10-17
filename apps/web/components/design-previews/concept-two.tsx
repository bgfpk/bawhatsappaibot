import styles from "./design-preview.module.css";
import { PreviewActionRow, PreviewPricingTeaser, PreviewProductMockup } from "./preview-mockups";
import {
  PREVIEW_GUARDRAILS,
  PREVIEW_PRICING_TEASER,
  PREVIEW_SOLUTIONS,
  PREVIEW_USE_CASES,
} from "./preview-sections";

export function ConceptTwo() {
  return (
    <div className={styles.previewPage}>
      <section className={`${styles.editorialHero} ${styles.previewSection}`}>
        <div className={styles.editorialLead}>
          <p className={styles.previewEyebrow}>BlackArrow</p>
          <h1>WhatsApp AI that explains itself clearly in five seconds</h1>
          <p className={styles.previewLead}>
            An editorial, Plain-style direction focused on clarity and business trust. The layout
            is calmer, less flashy, and built around operational credibility instead of visual
            spectacle.
          </p>
          <PreviewActionRow />
        </div>
        <div className={styles.editorialAside}>
          <PreviewProductMockup />
        </div>
      </section>

      <section className={`${styles.previewSection} ${styles.previewSectionLight}`}>
        <div className={styles.sectionHeading}>
          <p className={styles.previewEyebrow}>Manual WhatsApp chaos</p>
          <h2>Show the friction first, then the controlled operating model</h2>
        </div>
        <div className={styles.storyGrid}>
          <article className={styles.storyCard}>
            <h3>What breaks when the inbox stays manual</h3>
            <ul>
              <li>Leads wait too long for simple answers.</li>
              <li>Orders disappear into message history.</li>
              <li>Owners repeat the same product and delivery details daily.</li>
            </ul>
          </article>
          <article className={`${styles.storyCard} ${styles.storyCardAccent}`}>
            <h3>What BlackArrow keeps under control</h3>
            <ul>
              {PREVIEW_SOLUTIONS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      <section className={styles.previewSection}>
        <div className={styles.sectionHeading}>
          <p className={styles.previewEyebrow}>Use cases</p>
          <h2>Credible businesses, not fake enterprise name-dropping</h2>
        </div>
        <div className={styles.useCaseStrip}>
          {PREVIEW_USE_CASES.map((item) => (
            <span key={item} className={styles.useCaseChip}>
              {item}
            </span>
          ))}
        </div>
      </section>

      <section className={`${styles.previewSection} ${styles.previewSectionMuted}`}>
        <div className={styles.sectionHeading}>
          <p className={styles.previewEyebrow}>Operational safeguards</p>
          <h2>The design emphasizes control, visibility, and safer rollout behavior</h2>
        </div>
        <div className={styles.guardrailGrid}>
          {PREVIEW_GUARDRAILS.map((item) => (
            <article key={item} className={styles.guardrailCard}>
              <p>{item}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.previewSection}>
        <div className={styles.sectionHeading}>
          <p className={styles.previewEyebrow}>Pricing</p>
          <h2>Subscription and wallet story stays clear and businesslike</h2>
        </div>
        <PreviewPricingTeaser plans={PREVIEW_PRICING_TEASER} />
      </section>
    </div>
  );
}
