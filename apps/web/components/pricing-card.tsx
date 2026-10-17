import { ButtonLink } from "./button-link";

export function PricingCard({
  name,
  price,
  regularPrice,
  badge,
  description,
  highlights,
  ctaHref,
}: {
  name: string;
  price: string;
  regularPrice: string;
  badge?: string;
  description: string;
  highlights: string[];
  ctaHref: string;
}) {
  return (
    <article className={["pricing-card", badge ? "pricing-card-featured" : ""].filter(Boolean).join(" ")}>
      <div className="pricing-card-top">
        <div>
          <h3>{name}</h3>
          <p className="pricing-regular-price"><s>{regularPrice}</s> regular</p>
          <p className="pricing-price">{price}</p>
        </div>
        {badge ? <span className="pricing-badge">{badge}</span> : null}
      </div>
      <p className="pricing-description"><strong>Best for:</strong> {description}</p>
      <ul className="pricing-list">
        {highlights.map((item) => (
          <li key={`${name}-${item}`}>{item}</li>
        ))}
      </ul>
      <ButtonLink href={ctaHref} variant="primary" showArrow>
        Start Free
      </ButtonLink>
    </article>
  );
}
