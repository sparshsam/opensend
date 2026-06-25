"use client";

import { useEffect } from "react";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";
import { PwaUpdateNotification } from "@/components/pwa-update-notification";

export function PwaScripts() {
  useEffect(() => {
    // Register service worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Silently fail — PWA support is progressive
      });
    }
  }, []);

  return (
    <>
      <PwaInstallPrompt />
      <PwaUpdateNotification />
    </>
  );
}
