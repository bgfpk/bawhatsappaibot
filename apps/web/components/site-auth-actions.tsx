"use client";

import { useEffect, useState } from "react";

import { ButtonLink } from "./button-link";
import { ThemeToggle } from "./theme-toggle";

import { CURRENT_CTA_LINKS } from "@/lib/cta-links";

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

export function SiteAuthActions() {
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
    <div className="nav-actions">
      <ThemeToggle />
      {isLoggedIn ? null : (
        <ButtonLink href={CURRENT_CTA_LINKS.signIn} variant="ghost">
          Login
        </ButtonLink>
      )}
      <ButtonLink href={isLoggedIn ? CURRENT_CTA_LINKS.dashboard : CURRENT_CTA_LINKS.startTrial} showArrow>
        {isLoggedIn ? "Dashboard" : "Start Free"}
      </ButtonLink>
    </div>
  );
}
