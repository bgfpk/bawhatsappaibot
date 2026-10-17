import type { PublicIntegration } from "@/lib/integrations";
import { IntegrationIcon } from "@/components/integration-icon";

export function IntegrationGrid({ items }: { items: PublicIntegration[] }) {
  return (
    <div className="integration-grid">
      {items.map((item) => (
        <article key={item.name} className="integration-card">
          <div className="integration-card-top">
            <div className="integration-title">
              <IntegrationIcon name={item.name} />
              <h3>{item.name}</h3>
            </div>
            <span className={`integration-status integration-status-${item.status.toLowerCase().replaceAll(" ", "-")}`}>
              {item.status}
            </span>
          </div>
          <p>{item.description}</p>
        </article>
      ))}
    </div>
  );
}
