"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Sun, Moon } from "lucide-react";

type Theme = "dark" | "light";

// Light mode CSS variable values (overrides dark defaults from @theme inline)
const LIGHT_VARS: Record<string, string> = {
  "--color-bg-base": "#ffffff",
  "--color-bg-surface": "#f5f5f5",
  "--color-bg-surface-muted": "#ebebeb",
  "--color-text-primary": "#000000",
  "--color-text-secondary": "#4a4a4a",
  "--color-text-muted": "#8a8a8a",
  "--color-border-default": "rgba(0, 0, 0, 0.06)",
  "--color-accent": "#bc3fde",
  "--color-accent-hover": "#a832c4",
  "--color-error": "#d32d2d",
  "--color-background": "#ffffff",
  "--color-foreground": "#000000",
  "--color-muted": "#ebebeb",
  "--color-muted-foreground": "#8a8a8a",
  "--color-primary": "#bc3fde",
  "--color-primary-foreground": "#000000",
  "--color-border": "rgba(0, 0, 0, 0.06)",
};

// Dark mode CSS variable values
const DARK_VARS: Record<string, string> = {
  "--color-bg-base": "#000000",
  "--color-bg-surface": "#0d0d0d",
  "--color-bg-surface-muted": "#1a1a1a",
  "--color-text-primary": "#ffffff",
  "--color-text-secondary": "#a0a0a0",
  "--color-text-muted": "#8a8a8a",
  "--color-border-default": "rgba(255, 255, 255, 0.06)",
  "--color-accent": "#bc3fde",
  "--color-accent-hover": "#a832c4",
  "--color-error": "#ff4d4d",
  "--color-background": "#000000",
  "--color-foreground": "#ffffff",
  "--color-muted": "#1a1a1a",
  "--color-muted-foreground": "#8a8a8a",
  "--color-primary": "#bc3fde",
  "--color-primary-foreground": "#ffffff",
  "--color-border": "rgba(255, 255, 255, 0.06)",
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

  // One-time: read stored preference and apply on mount
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
