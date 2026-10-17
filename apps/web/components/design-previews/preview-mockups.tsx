import { ButtonLink } from "@/components/button-link";

import styles from "./design-preview.module.css";

export function PreviewProductMockup({ energetic = false }: { energetic?: boolean }) {
  return (
    <div className={`${styles.mockupShell} ${energetic ? styles.mockupShellEnergetic : ""}`}>
      <div className={styles.mockupGlowA} />
      <div className={styles.mockupGlowB} />
      <div className={styles.mockupBadgeRow}>
        <span className={styles.mockupBadge}>WhatsApp connected</span>
        <span className={styles.mockupBadge}>Human handoff ready</span>
      </div>
      <div className={styles.mockupGrid}>
        <div className={styles.phoneCard}>
          <div className={styles.mockupHeader}>
            <div>
              <strong>WhatsApp customer</strong>
              <span>AI reply active</span>
            </div>
            <span className={styles.mockupStatus}>Live</span>
          </div>
          <div className={styles.chatStack}>
            <div className={`${styles.chatBubble} ${styles.chatCustomer}`}>
              Need price, delivery time, and the product photo.
            </div>
            <div className={`${styles.chatBubble} ${styles.chatAi}`}>
              Price shared, photo sent, delivery clarified, and missing order details requested.
            </div>
            <div className={styles.signalCardRow}>
              <div className={styles.signalCard}>
                <span>Order captured</span>
                <strong>Serum bundle, Lahore, COD</strong>
              </div>
              <div className={styles.signalCard}>
                <span>Media template</span>
                <strong>Product photo sent</strong>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.dashboardCard}>
          <div className={styles.mockupHeader}>
            <div>
              <strong>Live dashboard</strong>
              <span>Orders, wallet, reply control</span>
            </div>
            <span className={styles.mockupStatus}>Synced</span>
          </div>
          <div className={styles.metricGrid}>
            <div className={styles.metricTile}>
              <span>Wallet usage</span>
              <strong>$7.20 today</strong>
            </div>
            <div className={styles.metricTile}>
              <span>Replies</span>
              <strong>24 active</strong>
            </div>
            <div className={styles.metricTile}>
              <span>Handoff</span>
              <strong>Ready</strong>
            </div>
            <div className={styles.metricTile}>
              <span>Templates</span>
              <strong>Media loaded</strong>
            </div>
          </div>
          <div className={styles.handoffCard}>
            <div>
              <span>Operational safeguard</span>
              <strong>Pause for sensitive pricing request</strong>
            </div>
            <b>Human review</b>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PreviewPricingTeaser({
  plans,
}: {
  plans: Array<{ name: string; price: string; description: string; badge?: string }>;
}) {
  return (
    <div className={styles.pricingTeaserGrid}>
      {plans.map((plan) => (
        <article key={plan.name} className={styles.pricingTeaserCard}>
          <div className={styles.pricingTeaserTop}>
            <div>
              <h3>{plan.name}</h3>
              <p>{plan.price}</p>
            </div>
            {plan.badge ? <span>{plan.badge}</span> : null}
          </div>
          <div className={styles.pricingTeaserBody}>{plan.description}</div>
        </article>
      ))}
    </div>
  );
}

export function PreviewFaqList({ items }: { items: Array<{ question: string; answer: string }> }) {
  return (
    <div className={styles.previewFaqGrid}>
      {items.map((item) => (
        <article key={item.question} className={styles.previewFaqCard}>
          <h3>{item.question}</h3>
          <p>{item.answer}</p>
        </article>
      ))}
    </div>
  );
}

export function PreviewActionRow() {
  return (
    <div className={styles.previewButtonRow}>
      <ButtonLink href="https://blackarrow-source.offline.invalid/">Start free trial</ButtonLink>
      <ButtonLink href="/pricing" variant="secondary">
        View pricing
      </ButtonLink>
    </div>
  );
}
