"use client";

import { useEffect, useState, useCallback } from "react";
import { ArrowUpFromLine, ArrowDownToLine, Loader2, Trash2, AlertTriangle } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { useDevice } from "@/components/device-provider";
import { Button } from "@/components/ui/button";
import { formatBytes, formatDate } from "@/lib/utils";

interface HistoryItem {
  id: string;
  direction: "sent" | "received";
  file_name: string;
  file_size: number;
  mime_type: string;
  peer_device: string;
  status: string;
  created_at: string;
}

type FilterTab = "all" | "sent" | "received";

export default function HistoryPage() {
  const { user, loading: authLoading, signIn } = useAuth();
  const { devices } = useDevice();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/transfers?status=all");
      if (res.ok) {
        const data = await res.json();
        // Map transfers to history items with device info
        const deviceMap = new Map(devices.map((d) => [d.id, d.name]));
        const history: HistoryItem[] = (data ?? []).map((t: any) => ({
          id: t.id,
          direction: t.sender_device_id ? "sent" : "received",
          file_name: t.file_name,
          file_size: t.file_size,
          mime_type: t.mime_type,
          peer_device: deviceMap.get(t.sender_device_id || t.receiver_device_id) || "Unknown Device",
          status: t.status,
          created_at: t.created_at,
        }));
        setItems(history);
      } else {
        const err = await res.json().catch(() => ({ error: "Failed to load" }));
        setError(err.error || "Failed to load history");
      }
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [user, devices]);

  useEffect(() => {
    if (user) loadHistory();
    else if (!authLoading) {
      setLoading(false);
      setItems([]);
    }
  }, [user, authLoading, loadHistory]);

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      const res = await fetch(`/api/transfers/${id}`, { method: "DELETE" });
      if (res.ok) {
        setItems((prev) => prev.filter((i) => i.id !== id));
      }
    } catch {
      // Silently fail
    } finally {
      setDeleting(null);
    }
  };

  const filtered = filter === "all" ? items : items.filter((i) => i.direction === filter);

  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "sent", label: "Sent" },
    { key: "received", label: "Received" },
  ];

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
          Sign in to view your sent and received transfers.
        </p>
        <Button variant="primary" size="lg" onClick={signIn}>
          Sign in with Google
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="text-center sm:text-left">
        <h1 className="text-display text-text-primary">Transfer history</h1>
        <p className="mt-2 text-sm text-text-muted">
          {items.length > 0 ? `${items.length} transfer${items.length !== 1 ? "s" : ""}` : "Your sent and received files"}
        </p>
      </div>

      {/* Pill tabs */}
      <div className="flex gap-2 justify-center sm:justify-start">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition cursor-pointer ${
              filter === tab.key
                ? "bg-bg-surface-muted text-text-primary"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12">
          <Loader2 className="mx-auto size-6 text-accent animate-spin" />
        </div>
      ) : error ? (
        <div className="text-center py-12 space-y-4">
          <AlertTriangle className="mx-auto size-8 text-error" />
          <p className="text-sm text-text-muted">{error}</p>
          <Button variant="secondary" size="sm" onClick={loadHistory}>Retry</Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-xl font-bold text-text-primary">
            {filter === "all" ? "No transfers yet" : `No ${filter} transfers`}
          </p>
          <p className="mt-2 text-sm text-text-muted">
            Upload or receive a file to see it here
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-full px-5 py-3.5 bg-bg-surface-muted/30"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className="shrink-0 text-text-muted">
                  {item.direction === "sent" ? (
                    <ArrowUpFromLine className="size-4" />
                  ) : (
                    <ArrowDownToLine className="size-4" />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text-primary truncate">
                    {item.file_name}
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">
                    {formatBytes(item.file_size)} &middot; {item.peer_device} &middot; {formatDate(item.created_at)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-bold tracking-wider uppercase text-text-muted">
                  {item.direction === "sent" ? "Sent" : "Received"}
                </span>
                <button
                  onClick={() => handleDelete(item.id)}
                  disabled={deleting === item.id}
                  className="text-text-secondary hover:text-error transition p-1.5 disabled:opacity-40"
                >
                  {deleting === item.id ? (
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
