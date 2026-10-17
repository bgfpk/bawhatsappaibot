"use client";

import { useEffect, useState } from "react";

import { ButtonLink } from "./button-link";

import { CURRENT_CTA_LINKS } from "@/lib/cta-links";

type AuthAwareCtaProps = {
  children: string;
  className?: string;
  showArrow?: boolean;
  variant?: "primary" | "secondary" | "ghost";
};

function hasCurrentUser() {
  try {
    const raw = window.localStorage.getItem("currentUser");
    if (!raw) return false;
    const user = JSON.parse(raw);
    return Boolean(user && (user.id || user.$id || user.email));
  } catch {
    return false;
  }
}

export function AuthAwareCta({
  children,
  className = "",
  showArrow = true,
  variant = "primary",
}: AuthAwareCtaProps) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const sync = () => setIsLoggedIn(hasCurrentUser());
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  return (
    <ButtonLink
      href={isLoggedIn ? CURRENT_CTA_LINKS.dashboard : CURRENT_CTA_LINKS.startTrial}
      className={className}
      showArrow={showArrow}
      variant={variant}
    >
      {isLoggedIn ? "Dashboard" : children}
    </ButtonLink>
  );
}
