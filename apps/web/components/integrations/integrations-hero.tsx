import { ButtonLink } from "@/components/button-link";
import { CURRENT_CTA_LINKS } from "@/lib/cta-links";
import { ArrowRight, Bot, Code, Database, MessageSquare, Truck, Globe } from "lucide-react";
import styles from "./integrations.module.css";

export function IntegrationsHero() {
  return (
    <section className={styles.hero}>
      <div className={styles.eyebrow}>
        <Bot size={14} /> Integrations &amp; Data Flow
      </div>
      <h1 className={styles.heroTitle}>
        Connect BlackArrow to Your Store, Website, Couriers, and <span className="mint">Business Systems</span>
      </h1>
      <p className={styles.heroSubtitle}>
        BlackArrow connects with supported commerce platforms, website knowledge bases, courier tracking systems, public APIs, and webhooks where configured.
      </p>

      <div className={styles.actions}>
        <ButtonLink href={CURRENT_CTA_LINKS.startTrial} showArrow>
          Start Free
        </ButtonLink>
        <ButtonLink href="#integrations-hub" variant="secondary">
          Explore Supported Integrations
        </ButtonLink>
      </div>

      <div className={styles.heroFlowDiagram}>
        <div className={styles.flowNode}>
          <MessageSquare size={16} style={{ color: "var(--ca-brand)" }} />
          <span>WhatsApp Chat</span>
        </div>
        <ArrowRight size={16} className={styles.flowArrow} />
        <div className={`${styles.flowNode} ${styles.flowNodeActive}`}>
          <Bot size={16} />
          <span>BlackArrow Engine</span>
        </div>
        <ArrowRight size={16} className={styles.flowArrow} />
        <div className={styles.flowNode}>
          <Globe size={16} style={{ color: "var(--ca-brand)" }} />
          <span>Store &amp; Website</span>
        </div>
        <ArrowRight size={16} className={styles.flowArrow} />
        <div className={styles.flowNode}>
          <Truck size={16} style={{ color: "var(--ca-brand)" }} />
          <span>Courier &amp; API</span>
        </div>
      </div>
    </section>
  );
}
