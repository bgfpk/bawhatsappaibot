import Link from "next/link";
import styles from "./features.module.css";

const CATEGORIES = [
  { id: "ai-understanding", label: "AI Understanding" },
  { id: "business-knowledge", label: "Business Knowledge" },
  { id: "customers-crm", label: "Customers & CRM" },
  { id: "crm-pipeline", label: "CRM Pipeline" },
  { id: "orders-followups", label: "Orders & Follow-Ups" },
  { id: "media-sequences", label: "Media & Sequences" },
  { id: "human-control", label: "Human Control" },
  { id: "instance-control", label: "Instance Control" },
  { id: "integrations", label: "Integrations" },
  { id: "usage-billing", label: "Usage & Billing" },
  { id: "workflows", label: "Workflows" },
];

export function FeaturesNav() {
  return (
    <nav className={styles.stickyNav} aria-label="Feature categories">
      <div className={styles.container}>
        <div className={styles.categoryList}>
          {CATEGORIES.map((cat) => (
            <Link key={cat.id} href={`#${cat.id}`} className={styles.categoryLink}>
              {cat.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
