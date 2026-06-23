"use client";

import { Loader2, Check, X, AlertTriangle } from "lucide-react";
import { type TransferProgress, type TransferState, formatSpeed, formatETA } from "@/lib/webrtc/webrtc-engine";
import { formatBytes } from "@/lib/utils";

interface TransferMonitorProps {
  fileName: string;
  fileSize: number;
  peerDevice: string;
  direction: "send" | "receive" | null;
  state: TransferState;
  progress: TransferProgress;
  onCancel?: () => void;
  compact?: boolean;
}

export function TransferMonitor({
  fileName,
  fileSize,
  peerDevice,
  direction,
  state,
  progress,
  onCancel,
  compact,
}: TransferMonitorProps) {
  const isActive = state === "transferring" || state === "negotiating" || state === "verifying";
  const isDone = state === "completed";
  const isError = state === "error" || state === "cancelled";

  if (compact) {
    return (
      <div className="rounded-full px-5 py-3 bg-bg-surface-muted/30 flex items-center gap-3">
        {isActive && <Loader2 className="size-4 text-accent animate-spin shrink-0" />}
        {isDone && <Check className="size-4 text-accent shrink-0" />}
        {isError && <X className="size-4 text-error shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-primary truncate">{fileName}</p>
          <p className="text-xs text-text-muted">
            {direction === "send" ? "To" : "From"}: {peerDevice} &middot; {formatBytes(fileSize)}
          </p>
        </div>
        {state === "transferring" && (
          <span className="text-xs text-text-muted shrink-0">{progress.percent}%</span>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl p-6 bg-bg-surface-muted space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold text-text-primary truncate">{fileName}</p>
          <p className="text-sm text-text-muted">
            {direction === "send" ? "Sending to" : "Receiving from"}: {peerDevice} &middot; {formatBytes(fileSize)}
          </p>
        </div>
        <div className="shrink-0">
          {isActive && <Loader2 className="size-6 text-accent animate-spin" />}
          {isDone && <Check className="size-6 text-accent" />}
          {isError && <AlertTriangle className="size-6 text-error" />}
        </div>
      </div>

      {/* Progress bar */}
      {state === "transferring" && (
        <div className="space-y-3">
          <div className="h-2 rounded-full bg-bg-base overflow-hidden">
            <div
              className="h-full rounded-full bg-accent transition-all duration-200"
              style={{ width: `${Math.min(progress.percent, 100)}%` }}
            />
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-text-muted">Speed</p>
              <p className="text-sm font-bold text-text-primary">{formatSpeed(progress.speedBps)}</p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Progress</p>
              <p className="text-sm font-bold text-text-primary">{progress.percent}%</p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Remaining</p>
              <p className="text-sm font-bold text-text-primary">{formatETA(progress.estimatedRemainingMs)}</p>
            </div>
          </div>

          <div className="text-center text-xs text-text-muted">
            {formatBytes(progress.bytesTransferred)} / {formatBytes(progress.totalBytes)}
          </div>
        </div>
      )}

      {/* Verifying */}
      {state === "verifying" && (
        <div className="text-center py-4 space-y-2">
          <Loader2 className="mx-auto size-6 text-accent animate-spin" />
          <p className="text-sm text-text-muted">Verifying checksum...</p>
        </div>
      )}

      {/* Done */}
      {isDone && (
        <div className="text-center py-2">
          <p className="text-sm font-bold text-accent">Transfer complete</p>
          <p className="text-xs text-text-muted mt-1">
            {formatBytes(progress.totalBytes)} transferred
          </p>
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="text-center py-2">
          <p className="text-sm font-bold text-error">
            {state === "cancelled" ? "Cancelled" : "Transfer failed"}
          </p>
        </div>
      )}

      {/* Cancel button */}
      {isActive && onCancel && (
        <button
          onClick={onCancel}
          className="text-xs text-text-muted hover:text-error transition"
        >
          Cancel transfer
        </button>
      )}
    </div>
  );
}
