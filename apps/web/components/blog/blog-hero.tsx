import React from "react";
import { BookOpen, ArrowRight, Layers, FileText } from "lucide-react";
import { ButtonLink } from "@/components/button-link";
import styles from "./blog.module.css";

export function BlogHero() {
  return (
    <section className={styles.heroSection}>
      <div className={styles.heroContent}>
        <div className={styles.eyebrow}>
          <BookOpen size={14} /> BlackArrow Blog
        </div>
        <h1 className={styles.heroTitle}>BlackArrow Blog</h1>
        <p className={styles.heroSubtitle}>
          Practical guidance for WhatsApp-based sales, support, customer operations, AI configuration, and business automation.
        </p>

        <div className={styles.buttonRow}>
          <ButtonLink href="#articles">
            Browse Articles <ArrowRight size={16} />
          </ButtonLink>
          <ButtonLink href="/docs" variant="secondary">
            Read Documentation
          </ButtonLink>
          <ButtonLink href="/features" variant="ghost">
            Explore Features
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
