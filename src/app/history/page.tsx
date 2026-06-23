"use client";

import { useEffect, useState, useCallback } from "react";
import { ExternalLink, Loader2, Trash2, AlertTriangle } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { formatBytes, formatDate } from "@/lib/utils";

interface Transfer {
  id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  claim_code: string;
  download_count: number;
  status: string;
  expires_at: string;
  created_at: string;
}

export default function HistoryPage() {
  const { user, loading: authLoading, signIn } = useAuth();
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadTransfers = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/transfers?status=all");
      if (res.ok) {
        const data = await res.json();
        setTransfers(data);
      } else {
        const err = await res.json().catch(() => ({ error: "Failed to load" }));
        setError(err.error || "Failed to load transfers");
      }
    } catch {
      setError("Network error. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Reload when user changes
  useEffect(() => {
    if (user) loadTransfers();
    else if (!authLoading) {
      setLoading(false);
      setTransfers([]);
    }
  }, [user, authLoading, loadTransfers]);

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      const res = await fetch(`/api/transfers/${id}`, { method: "DELETE" });
      if (res.ok) {
        setTransfers((prev) => prev.filter((t) => t.id !== id));
      } else {
        const err = await res.json().catch(() => ({ error: "Delete failed" }));
        console.error(err.error);
      }
    } catch {
      console.error("Delete failed");
    } finally {
      setDeleting(null);
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "available": return "text-accent";
      case "uploading":
      case "scanning": return "text-text-muted";
      case "expired": return "text-text-muted";
      case "blocked": return "text-error";
      default: return "text-text-muted";
    }
  };

  if (authLoading) {
    return (
      <div className="text-center py-20">
        <Loader2 className="mx-auto size-6 text-accent animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-6 text-center py-12">
        <h1 className="text-display text-text-primary">Transfer history</h1>
        <p className="text-sm text-text-muted max-w-xs mx-auto">
          Sign in to view your transfer history and manage your files.
        </p>
        <Button variant="primary" size="lg" onClick={signIn}>
          Sign in with GitHub
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 sm:space-y-10">
      <div className="text-center sm:text-left">
        <h1 className="text-display text-text-primary">Transfer history</h1>
        <p className="mt-2 text-sm text-text-muted">
          {transfers.length > 0
            ? `${transfers.length} transfer${transfers.length !== 1 ? "s" : ""}`
            : "Your recently shared files"}
        </p>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <Loader2 className="mx-auto size-6 text-accent animate-spin" />
        </div>
      ) : error ? (
        <div className="text-center py-12 space-y-4">
          <AlertTriangle className="mx-auto size-8 text-error" />
          <p className="text-sm text-text-muted">{error}</p>
          <Button variant="secondary" size="sm" onClick={loadTransfers}>
            Retry
          </Button>
        </div>
      ) : transfers.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-xl font-bold text-text-primary">No transfers yet</p>
          <p className="mt-2 text-sm text-text-muted">
            Upload your first file to get started
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {transfers.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between gap-3 rounded-full px-5 py-3.5 bg-bg-surface-muted/30"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-text-primary truncate">
                  {t.file_name}
                </p>
                <p className="text-xs text-text-muted mt-0.5">
                  {formatBytes(t.file_size)} &middot; {formatDate(t.created_at)} &middot; {t.download_count} download{t.download_count !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-xs font-bold tracking-wider uppercase ${statusColor(t.status)}`}>
                  {t.status}
                </span>
                {t.status === "available" && (
                  <a
                    href={`/t/${t.claim_code}`}
                    className="text-text-secondary hover:text-text-primary transition p-1.5"
                    target="_blank"
                    rel="noopener"
                  >
                    <ExternalLink className="size-4" />
                  </a>
                )}
                <button
                  onClick={() => handleDelete(t.id)}
                  disabled={deleting === t.id}
                  className="text-text-secondary hover:text-error transition p-1.5 disabled:opacity-40"
                >
                  {deleting === t.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
