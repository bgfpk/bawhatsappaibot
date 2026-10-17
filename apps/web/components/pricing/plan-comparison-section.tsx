import { Table } from "lucide-react";
import styles from "./pricing.module.css";

export function PlanComparisonSection() {
  const comparisonData = [
    {
      category: "Platform Capacity",
      rows: [
        { feature: "Monthly Subscription Price", starter: "$9 / mo", growth: "$29 / mo", pro: "$89 / mo" },
        { feature: "Included WhatsApp Instances", starter: "1 instance", growth: "3 instances", pro: "10 instances" },
        { feature: "Max WhatsApp Instances", starter: "Up to 2", growth: "Up to 7", pro: "Up to 30" },
        { feature: "Included Products / Services", starter: "5 items", growth: "30 items", pro: "100 items" },
        { feature: "Max Products / Services", starter: "Up to 30", growth: "Up to 150", pro: "Up to 500" },
        { feature: "Customer Records", starter: "1,000 records", growth: "10,000 records", pro: "50,000 records" },
        { feature: "Orders Capacity per Month", starter: "300 orders", growth: "2,000 orders", pro: "10,000 orders" },
      ],
    },
    {
      category: "Content & Sequence Workflows",
      rows: [
        { feature: "Media Templates", starter: "100 templates", growth: "500 templates", pro: "2,000 templates" },
        { feature: "Media Groups", starter: "2 groups", growth: "5 groups", pro: "15 groups" },
        { feature: "Sequence Groups", starter: "3 groups", growth: "10 groups", pro: "30 groups" },
      ],
    },
    {
      category: "Operations & Support",
      rows: [
        { feature: "Support Tier", starter: "Standard support", growth: "Priority support", pro: "Priority support" },
        { feature: "Courier Integration Support", starter: "Standard", growth: "Supported (PostEx / Leopards)", pro: "Supported (PostEx / Leopards)" },
        { feature: "Account Add-ons Access", starter: "Supported", growth: "Supported", pro: "Supported" },
      ],
    },
  ];

  return (
    <section id="comparison" className={styles.section}>
      <div className={styles.header}>
        <div className={styles.eyebrow}>
          <Table size={14} /> Full Capability Breakdown
        </div>
        <h2 className={styles.title}>Detailed Plan Capacity Comparison</h2>
        <p className={styles.subtitle}>
          Review all plan limits side-by-side to find the right baseline for your business operations.
        </p>
      </div>

      {/* Desktop Comparison Matrix Table */}
      <div className={styles.desktopMatrixWrapper}>
        <table className={styles.matrixTable}>
          <thead>
            <tr>
              <th className={styles.featureName}>Plan Feature</th>
              <th className={styles.planCol}>Starter ($9/mo)</th>
              <th className={styles.planCol} style={{ color: "var(--ca-brand-strong)" }}>Growth ($29/mo)</th>
              <th className={styles.planCol}>Pro ($89/mo)</th>
            </tr>
          </thead>
          <tbody>
            {comparisonData.map((cat, idx) => (
              <tr key={idx} className="matrix-group">
                <td colSpan={4} className={styles.categoryHeader}>
                  {cat.category}
                </td>
              </tr>
            )).flatMap((catHeader, i) => [
              catHeader,
              ...comparisonData[i].rows.map((row, j) => (
                <tr key={`${i}-${j}`}>
                  <td className={styles.featureName}>{row.feature}</td>
                  <td className={styles.planCol}>{row.starter}</td>
                  <td className={styles.planCol} style={{ fontWeight: 600, color: "var(--ca-text-bright)" }}>
                    {row.growth}
                  </td>
                  <td className={styles.planCol}>{row.pro}</td>
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>

      {/* Mobile Comparison Grouped Stack */}
      <div className={styles.mobileComparisonStack}>
        {comparisonData.map((cat, i) => (
          <div key={i} className={styles.mobileCompGroup}>
            <div className={styles.mobileCompGroupTitle}>{cat.category}</div>
            {cat.rows.map((row, j) => (
              <div key={j} className={styles.mobileCompItem}>
                <div className={styles.mobileCompFeature}>{row.feature}</div>
                <div className={styles.mobileCompValues}>
                  <div className={styles.mobileCompValCol}>
                    <span className={styles.mobileCompPlanLabel}>Starter</span>
                    <span className={styles.mobileCompValText}>{row.starter}</span>
                  </div>
                  <div className={styles.mobileCompValCol}>
                    <span className={styles.mobileCompPlanLabel} style={{ color: "var(--ca-brand-strong)" }}>Growth</span>
                    <span className={styles.mobileCompValText} style={{ color: "var(--ca-brand-strong)" }}>{row.growth}</span>
                  </div>
                  <div className={styles.mobileCompValCol}>
                    <span className={styles.mobileCompPlanLabel}>Pro</span>
                    <span className={styles.mobileCompValText}>{row.pro}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
