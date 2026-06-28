"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { DownloadCloud, X } from "lucide-react";

const DISMISSED_KEY = "opensend_pwa_dismissed";

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Already installed — never prompt
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
      return;
    }

    // User actively dismissed a previous prompt — skip
    if (localStorage.getItem(DISMISSED_KEY) === "1") return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    window.addEventListener("beforeinstallprompt", handler);

    // Detect successful install
    window.addEventListener("appinstalled", () => {
      setInstalled(true);
      setShowPrompt(false);
    });

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    if (result.outcome === "accepted") {
      setInstalled(true);
    }
    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setShowPrompt(false);
  };

  if (installed || !showPrompt) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 sm:left-auto sm:right-4 sm:bottom-4 sm:w-80 z-50 rounded-2xl p-4 bg-bg-surface border border-border-default shadow-lg">
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 text-text-muted hover:text-text-primary cursor-pointer"
        aria-label="Dismiss"
      >
        <X className="size-4" />
      </button>
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5">
          <DownloadCloud className="size-5 text-accent" />
        </div>
        <div className="space-y-2 flex-1">
          <p className="text-sm font-bold text-text-primary">Install OpenSend</p>
          <p className="text-xs text-text-muted">
            Install for a faster, app-like experience.
          </p>
          <Button variant="primary" size="sm" onClick={handleInstall}>
            <DownloadCloud className="size-4" /> Install
          </Button>
        </div>
      </div>
    </div>
  );
}
