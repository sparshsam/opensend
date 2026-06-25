"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, X } from "lucide-react";

export function PwaUpdateNotification() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // Register the SW and listen for updates
    navigator.serviceWorker.register("/sw.js").then((reg) => {
      // Check if there's already a waiting worker on page load
      if (reg.waiting) {
        setWaitingWorker(reg.waiting);
        setShow(true);
      }

      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        if (!newWorker) return;

        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            // New version available
            setWaitingWorker(newWorker);
            setShow(true);
          }
        });
      });
    });

    // When the controlling SW changes, reload for new content
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }, []);

  const handleUpdate = () => {
    if (!waitingWorker) return;
    // Send "skip waiting" message
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 sm:left-auto sm:right-4 sm:bottom-4 sm:w-80 z-50 rounded-2xl p-4 bg-bg-surface border border-border-default shadow-lg">
      <button
        onClick={() => setShow(false)}
        className="absolute top-3 right-3 text-text-muted hover:text-text-primary cursor-pointer"
        aria-label="Dismiss"
      >
        <X className="size-4" />
      </button>
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5">
          <RefreshCw className="size-5 text-accent" />
        </div>
        <div className="space-y-2 flex-1">
          <p className="text-sm font-bold text-text-primary">Update available</p>
          <p className="text-xs text-text-muted">
            A new version of OpenSend is ready.
          </p>
          <Button variant="primary" size="sm" onClick={handleUpdate}>
            <RefreshCw className="size-4" /> Update
          </Button>
        </div>
      </div>
    </div>
  );
}
