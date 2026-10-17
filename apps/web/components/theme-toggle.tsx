"use client";

import { useEffect, useState } from "react";

const THEME_KEY = "blackarrow-public-theme";
type Theme = "dark" | "light";

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function ThemeToggle({ mobile = false }: { mobile?: boolean }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => setTheme(currentTheme()), []);

  const nextTheme = theme === "dark" ? "light" : "dark";
  const label = `Use ${nextTheme} theme`;

  function toggleTheme() {
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;
    window.localStorage.setItem(THEME_KEY, nextTheme);
    setTheme(nextTheme);
  }

  return (
    <button
      type="button"
      className={`theme-toggle${mobile ? " theme-toggle-mobile" : ""}`}
      aria-label={label}
      title={label}
      onClick={toggleTheme}
    >
      <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
      {mobile ? <span>{label}</span> : null}
    </button>
  );
}
