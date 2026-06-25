"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * Provides a subtle fade-in on page navigation for native-feeling transitions.
 * Only animates on route changes within the SPA, not on initial load.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    // Brief fade-out on route change
    setVisible(false);
    const timer = setTimeout(() => setVisible(true), 30);
    return () => clearTimeout(timer);
  }, [pathname, mounted]);

  return (
    <div
      style={{
        opacity: visible ? 1 : 0.6,
        transition: "opacity 150ms ease-in-out",
      }}
    >
      {children}
    </div>
  );
}
