"use client";

import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";
import { trackCtaClick, trackWhatsAppClick } from "@/lib/analytics";

type ButtonLinkProps = {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
  showArrow?: boolean;
  ctaName?: string;
  ctaLocation?: string;
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
};

export function ButtonLink({
  href,
  children,
  variant = "primary",
  className = "",
  showArrow = false,
  ctaName,
  ctaLocation,
  onClick,
}: ButtonLinkProps) {
  const classes = ["button-link", `button-link-${variant}`, className].filter(Boolean).join(" ");
  const content = (
    <>
      <span>{children}</span>
      {showArrow ? <span className="arrow-circle" aria-hidden="true">-&gt;</span> : null}
    </>
  );

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    const resolvedName = ctaName || (typeof children === "string" ? children : "CTA Button");
    if (href.includes("wa.me") || href.includes("whatsapp.com")) {
      trackWhatsAppClick({
        cta_name: resolvedName,
        destination_url: href,
      });
    } else {
      trackCtaClick({
        cta_name: resolvedName,
        destination: href,
        cta_location: ctaLocation || "button_link",
      });
    }
    onClick?.(e);
  };

  if (href.startsWith("http") || href.startsWith("mailto:")) {
    return (
      <a href={href} className={classes} onClick={handleClick}>
        {content}
      </a>
    );
  }

  return (
    <Link href={href} className={classes} onClick={handleClick}>
      {content}
    </Link>
  );
}
