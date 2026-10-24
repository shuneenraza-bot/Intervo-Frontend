import { useEffect, useState } from "react";

/* Light / dark theme. An explicit choice is saved; otherwise the system preference wins.
   index.html applies the same logic before first paint so there is no flash. */

const KEY = "intervo.theme";
const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

function savedTheme() {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

function initialTheme() {
  const applied = document.documentElement.dataset.theme;
  if (applied === "light" || applied === "dark") return applied;
  return savedTheme() || (darkQuery().matches ? "dark" : "light");
}

export function useTheme() {
  const [theme, setTheme] = useState(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  /* Follow the OS setting until the user picks a theme themselves */
  useEffect(() => {
    const mq = darkQuery();
    const onChange = (e) => {
      if (!savedTheme()) setTheme(e.matches ? "dark" : "light");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* storage blocked — the choice still applies for this visit */
    }
    setTheme(next);
  }

  return [theme, toggle];
}
