export function FeatureCard({
  title,
  body,
  kicker,
  icon,
  tone = "default",
}: {
  title: string;
  body: string;
  kicker?: string;
  icon?: string;
  tone?: "default" | "accent" | "muted";
}) {
  return (
    <article className={`feature-card feature-card-${tone}`}>
      {icon ? <div className="feature-icon">{icon}</div> : null}
      {kicker ? <p className="card-kicker">{kicker}</p> : null}
      <h3>{title}</h3>
      <p>{body}</p>
    </article>
  );
}
