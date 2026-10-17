"use client";

import React, { useState } from "react";
import { HelpCircle, ChevronDown, ChevronUp } from "lucide-react";
import { DOCS_FAQS } from "./docs-faq-data";
import styles from "./docs.module.css";

export function DocsFaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggleFaq = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section id="docs-faq" className={styles.section}>
      <div className={styles.container}>
        <div className={`${styles.header} ${styles.headerCenter}`}>
          <div className={styles.eyebrow}>
            <HelpCircle size={14} /> Documentation FAQ
          </div>
          <h2 className={styles.title}>Frequently Asked Questions</h2>
          <p className={styles.subtitle} style={{ margin: "0 auto" }}>
            Factual answers to common questions about setup, connection, reply modes, billing, and support.
          </p>
        </div>

        <div className={styles.faqList}>
          {DOCS_FAQS.map((faq, index) => {
            const isOpen = openIndex === index;
            return (
              <div
                key={faq.question}
                className={`${styles.faqItem} ${isOpen ? styles.faqItemOpen : ""}`}
              >
                <button
                  type="button"
                  className={styles.faqButton}
                  onClick={() => toggleFaq(index)}
                  aria-expanded={isOpen}
                >
                  <span>{faq.question}</span>
                  {isOpen ? <ChevronUp size={18} color="#32cf91" /> : <ChevronDown size={18} color="#8c9ba5" />}
                </button>
                {isOpen && (
                  <div className={styles.faqAnswer}>
                    {faq.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
