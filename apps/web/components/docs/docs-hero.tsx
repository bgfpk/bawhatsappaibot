import React from "react";
import Link from "next/link";
import { BookOpen, Sparkles, HelpCircle, ArrowRight } from "lucide-react";
import { ButtonLink } from "@/components/button-link";
import { CURRENT_CTA_LINKS } from "@/lib/cta-links";
import styles from "./docs.module.css";

export function DocsHero() {
  return (
    <section className={styles.heroSection}>
      <div className={styles.heroContent}>
        <div className={styles.eyebrow}>
          <BookOpen size={14} /> BlackArrow Documentation
        </div>
        <h1 className={styles.heroTitle}>BlackArrow Documentation</h1>
        <p className={styles.heroSubtitle}>
          Set up your WhatsApp instance, configure AI behaviour, organize customer operations,
          and understand supported integrations.
        </p>

        <div className={styles.buttonRow}>
          <ButtonLink href="#quick-setup">
            Start with Quick Setup <ArrowRight size={16} />
          </ButtonLink>
          <ButtonLink href="#categories" variant="secondary">
            Browse Documentation
          </ButtonLink>
          <ButtonLink href="/contact" variant="ghost">
            Contact Support
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
