"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, Lock, AlertTriangle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-fetch";
import { formatBytes, formatDate } from "@/lib/utils";

interface TransferInfo {
  id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  claim_code: string;
  download_count: number;
  download_limit: number | null;
  expires_at: string;
  status: string;
}

type PageState = "loading" | "ready" | "downloading" | "gone" | "error";

export default function TransferPage() {
  const { code } = useParams<{ code: string }>();
  const [pageState, setPageState] = useState<PageState>("loading");
  const [info, setInfo] = useState<TransferInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");

  // Fetch transfer metadata on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await apiFetch(`/api/claim/${code}`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            setInfo(data);
            setPageState("ready");
          }
        } else {
          const err = await res.json().catch(() => ({ error: "Transfer not found", status: "error" }));
          if (!cancelled) {
            setErrorMsg(err.error || "Transfer not found");
            setPageState(
              err.status === "expired" || err.status === "deleted" || err.status === "blocked"
                ? "gone"
                : "error"
            );
          }
        }
      } catch {
        if (!cancelled) {
          setPageState("error");
          setErrorMsg("Network error. Check your connection.");
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [code]);

  const handleDownload = useCallback(() => {
    setPageState("downloading");
    const a = document.createElement("a");
    a.href = `/api/download/${code}`;
    a.download = info?.file_name || "file";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => setPageState("ready"), 2000);
  }, [code, info]);

  if (pageState === "loading") {
    return (
      <div className="text-center py-20 space-y-4">
        <Loader2 className="mx-auto size-8 text-accent animate-spin" />
        <p className="text-sm text-text-muted">Loading transfer...</p>
      </div>
    );
  }

  if (pageState === "gone") {
    return (
      <div className="space-y-8 text-center py-12">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-error/10">
          <AlertTriangle className="size-8 text-error" />
        </div>
        <h1 className="text-display text-text-primary">Not available</h1>
        <p className="text-sm text-text-muted max-w-sm mx-auto">{errorMsg}</p>
        <Button variant="primary" onClick={() => window.location.href = "/"}>
          Send your own file
        </Button>
      </div>
    );
  }

  if (pageState === "error") {
    return (
      <div className="space-y-8 text-center py-12">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-error/10">
          <AlertTriangle className="size-8 text-error" />
        </div>
        <h1 className="text-display text-text-primary">Something went wrong</h1>
        <p className="text-sm text-text-muted max-w-sm mx-auto">{errorMsg}</p>
        <Button variant="primary" onClick={() => window.location.href = "/"}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 sm:space-y-12">
      <div className="text-center">
        <div className="mx-auto mb-6 flex size-14 sm:size-16 items-center justify-center rounded-full bg-accent/10">
          {pageState === "downloading" ? (
            <Check className="size-7 sm:size-8 text-accent" />
          ) : (
            <Lock className="size-6 sm:size-7 text-accent" />
          )}
        </div>
        <h1 className="text-hero text-text-primary">
          {pageState === "downloading" ? "Downloading..." : "Secure transfer"}
        </h1>
        <p className="mt-3 sm:mt-4 text-base sm:text-lg text-text-secondary max-w-md mx-auto">
          A file is waiting for you. Tap to download.
        </p>
      </div>

      <div className="border-t-2 border-dashed border-text-muted/30 pt-6 sm:pt-8 space-y-4">
        {info && (
          <>
            <div className="flex justify-between items-center py-3 border-b border-border-default">
              <span className="text-label text-text-muted">File</span>
              <span className="text-sm font-mono text-text-primary text-right break-all max-w-[60%]">
                {info.file_name}
              </span>
            </div>
            <div className="flex justify-between py-3 border-b border-border-default">
              <span className="text-label text-text-muted">Size</span>
              <span className="text-sm text-text-muted">{formatBytes(info.file_size)}</span>
            </div>
          </>
        )}
        <div className="flex justify-between py-3 border-b border-border-default">
          <span className="text-label text-text-muted">Code</span>
          <span className="font-mono text-lg sm:text-xl font-bold text-text-primary tracking-[0.2em]">
            {code}
          </span>
        </div>
        {info?.expires_at && (
          <div className="flex justify-between py-3 text-sm">
            <span className="text-label text-text-muted">Expires</span>
            <span className="text-text-muted">{formatDate(info.expires_at)}</span>
          </div>
        )}
        <p className="text-center text-xs text-text-muted pt-4">
          &mdash; OpenSend v0.3.1 &mdash;
        </p>
      </div>

      <Button
        variant="primary"
        size="lg"
        className="w-full min-h-[56px] text-base"
        disabled={pageState === "downloading"}
        onClick={handleDownload}
      >
        {pageState === "downloading" ? (
          <><Check className="size-6" />Downloaded!</>
        ) : (
          <><Download className="size-6" />Download file</>
        )}
      </Button>

      <div className="border-t border-b border-border-default py-4">
        <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-label text-text-muted">
          <span>Free &amp; ad-free</span>
          <span className="text-text-muted/30 hidden sm:inline">&middot;</span>
          <span>Encrypted transfer</span>
          <span className="text-text-muted/30 hidden sm:inline">&middot;</span>
          <span>{info?.download_count || 0} download{(info?.download_count || 0) !== 1 ? "s" : ""} so far</span>
        </div>
      </div>
    </div>
  );
}
