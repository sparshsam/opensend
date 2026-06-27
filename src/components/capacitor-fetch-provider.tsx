"use client";

import { useEffect } from "react";
import { setupCapacitorFetch } from "@/lib/api-fetch";

/**
 * Client-only component that patches window.fetch for Capacitor builds.
 * Must be rendered inside a client component boundary.
 */
export function CapacitorFetchProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    setupCapacitorFetch();
  }, []);
  return <>{children}</>;
}
