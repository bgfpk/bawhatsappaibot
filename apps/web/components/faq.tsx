"use client";

import { useState } from "react";

export function Faq({
  items,
  compact = false,
}: {
  items: Array<{ question: string; answer: string }>;
  compact?: boolean;
}) {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <div className={compact ? "faq-list faq-list-compact" : "faq-list"}>
      {items.map((item, index) => {
        const open = openIndex === index;

        return (
          <button
            key={item.question}
            type="button"
            className="faq-item"
            onClick={() => setOpenIndex(open ? -1 : index)}
            aria-expanded={open}
          >
            <div className="faq-question">
              <span>{item.question}</span>
              <span className="faq-toggle">{open ? "-" : "+"}</span>
            </div>
            <div className={open ? "faq-answer faq-answer-open" : "faq-answer"}>
              <p>{item.answer}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
