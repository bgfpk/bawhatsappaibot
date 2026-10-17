import type { ReactNode } from "react";

export function Section({
  eyebrow,
  title,
  description,
  children,
  className = "",
  id,
}: {
  eyebrow?: string;
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={["site-section", className].filter(Boolean).join(" ")}>
      {eyebrow || title || description ? (
        <div className="section-heading">
          {eyebrow ? <p className="label">{eyebrow}</p> : null}
          {title ? <h2>{title}</h2> : null}
          {description ? <p className="section-description">{description}</p> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function SectionCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={["surface-card", className].filter(Boolean).join(" ")}>{children}</div>;
}
