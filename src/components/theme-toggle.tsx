"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Sun, Moon } from "lucide-react";

type Theme = "dark" | "light";

interface ThemeContext {
  theme: Theme;
  toggle: () => void;
}

const ThemeCtx = createContext<ThemeContext>({
  theme: "dark",
  toggle: () => {},
});

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "light") {
    root.classList.add("light");
  } else {
    root.classList.remove("light");
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("opensend-theme") as Theme | null;
    const t = stored === "light" ? "light" : "dark";
    setTheme(t);
    applyTheme(t);
    setMounted(true);
  }, []);

  const toggle = () => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      applyTheme(next);
      localStorage.setItem("opensend-theme", next);
      return next;
    });
  };

  return (
    <ThemeCtx.Provider value={{ theme: mounted ? theme : "dark", toggle }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export function ThemeToggle() {
  const { theme, toggle } = useContext(ThemeCtx);

  return (
    <button
      onClick={toggle}
      type="button"
      className="rounded-full p-2 text-text-secondary hover:text-text-primary hover:bg-bg-surface-muted transition cursor-pointer"
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

export function useTheme() {
  return useContext(ThemeCtx);
}
