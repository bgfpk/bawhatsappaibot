import { Layers } from "lucide-react";
import styles from "./integrations.module.css";

export function DataFlowExamplesSection() {
  const workflows = [
    {
      title: "Product & Catalog Inquiry Flow",
      steps: [
        "Customer sends WhatsApp inquiry about product price or details.",
        "BlackArrow checks configured store catalog data or website knowledge sources.",
        "Customer receives grounded, accurate WhatsApp reply with product information.",
      ],
    },
    {
      title: "Logistics & Delivery Status Flow",
      steps: [
        "Customer requests delivery update or tracking number on WhatsApp.",
        "BlackArrow queries configured PostEx or Leopards courier integration.",
        "Customer receives available tracking status or tracking link directly in chat.",
      ],
    },
    {
      title: "External System Event Webhook Flow",
      steps: [
        "Customer data event occurs in WhatsApp workspace.",
        "BlackArrow dispatches configured JSON webhook payload.",
        "Your external endpoint or spreadsheet receiver receives structured customer data.",
      ],
    },
  ];

  return (
    <section id="data-flows" className={styles.section}>
      <div className={styles.header}>
        <div className={styles.eyebrow}>
          <Layers size={14} /> Illustrative Workflows
        </div>
        <h2 className={styles.title}>How Data Flows Between Systems</h2>
        <p className={styles.subtitle}>
          Explore step-by-step examples of how customer messages interact with your connected store, couriers, and backend tools.
        </p>
      </div>

      <div className={styles.examplesGrid}>
        {workflows.map((wf, idx) => (
          <div key={idx} className={styles.exampleCard}>
            <div className={styles.exampleTag}>Illustrative Workflow</div>
            <h3 className={styles.exampleTitle}>{wf.title}</h3>
            <ol className={styles.exampleSteps}>
              {wf.steps.map((step, sIdx) => (
                <li key={sIdx} className={styles.exampleStepItem}>
                  <span className={styles.stepNum}>{sIdx + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}
