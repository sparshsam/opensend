"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Sun, Moon } from "lucide-react";

type Theme = "dark" | "light";

// ── Light mode — purple-tinted white background ──
const LIGHT_VARS: Record<string, string> = {
  "--color-bg-base": "#faf0ff",
  "--color-bg-surface": "#f5e6fa",
  "--color-bg-surface-muted": "#ebd6f0",
  "--color-text-primary": "#1a0422",
  "--color-text-secondary": "#5c3a6b",
  "--color-text-muted": "#8a6b99",
  "--color-border-default": "rgba(90, 20, 120, 0.10)",
  "--color-accent": "#bc3fde",
  "--color-accent-hover": "#a832c4",
  "--color-error": "#c62828",
  "--color-background": "#faf0ff",
  "--color-foreground": "#1a0422",
  "--color-muted": "#ebd6f0",
  "--color-muted-foreground": "#8a6b99",
  "--color-primary": "#bc3fde",
  "--color-primary-foreground": "#1a0422",
  "--color-border": "rgba(90, 20, 120, 0.10)",
};

// ── Dark mode — deep purple-toned black background ──
const DARK_VARS: Record<string, string> = {
  "--color-bg-base": "#1a0422",
  "--color-bg-surface": "#240a30",
  "--color-bg-surface-muted": "#2d103a",
  "--color-text-primary": "#ffffff",
  "--color-text-secondary": "#d4b0e0",
  "--color-text-muted": "#a080b0",
  "--color-border-default": "rgba(255, 255, 255, 0.08)",
  "--color-accent": "#bc3fde",
  "--color-accent-hover": "#a832c4",
  "--color-error": "#ff4d4d",
  "--color-background": "#1a0422",
  "--color-foreground": "#ffffff",
  "--color-muted": "#2d103a",
  "--color-muted-foreground": "#a080b0",
  "--color-primary": "#bc3fde",
  "--color-primary-foreground": "#ffffff",
  "--color-border": "rgba(255, 255, 255, 0.08)",
};

function applyTheme(theme: Theme) {
  const vars = theme === "light" ? LIGHT_VARS : DARK_VARS;
  const root = document.documentElement;
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
}

interface ThemeContext {
  theme: Theme;
  toggle: () => void;
}

const ThemeCtx = createContext<ThemeContext>({
  theme: "dark",
  toggle: () => {},
});

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
