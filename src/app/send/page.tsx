"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import {
  Upload, ArrowUpFromLine, QrCode, Copy, Check, Loader2,
  Wifi, Cloud, Bluetooth, ArrowLeft, Share2, Link,
  Bug, X, File, ArrowRight, Clock, Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { QRDisplay } from "@/components/qr-display";
import { generateEphemeralName } from "@/lib/ephemeral-names";
import { formatBytes } from "@/lib/utils";
import { PollSignaling } from "@/lib/webrtc/poll-signaling";
import { WebRTCEngine, type TransferProgress, type TransferMetadata, formatSpeed, formatETA } from "@/lib/webrtc/webrtc-engine";
import { TRANSFER_METHODS, getDefaultMethod, type TransferMethod, getMethodInfo } from "@/lib/transfer-methods";
import { useRouter } from "next/navigation";
import { addLocalHistory } from "@/lib/local-history";

type SendState =
  | "select-files"
  | "creating"
  | "waiting"
  | "cloud-uploading"
  | "cloud-ready"
  | "receiver-joined"
  | "connecting"
  | "sending-file"
  | "verifying"
  | "sending-next"
  | "completed"
  | "failed";

interface SelectedFile {
  file: File;
  id: string;
}

const MAX_FILES = 20;
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const MAX_TOTAL_SIZE = 500 * 1024 * 1024; // 500 MB total batch limit

const STATE_LABELS: Record<SendState, string> = {
  "select-files": "Select files",
  "creating": "Creating session...",
  "waiting": "Waiting for receiver",
  "cloud-uploading": "Uploading to cloud...",
  "cloud-ready": "Ready to share",
  "receiver-joined": "Receiver joined",
  "connecting": "Creating secure connection",
  "sending-file": "Sending file",
  "verifying": "Verifying transfer",
  "sending-next": "Preparing next file",
  "completed": "Sent successfully",
  "failed": "Failed",
};

function MethodIcon({ id, className }: { id: TransferMethod; className?: string }) {
  if (id === "direct") return <Wifi className={className} />;
  if (id === "bluetooth") return <Bluetooth className={className} />;
  return <Cloud className={className} />;
}

export default function SendPage() {
  const router = useRouter();
  const [guestDevice] = useState(generateEphemeralName);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [method, setMethod] = useState<TransferMethod>(getDefaultMethod());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [guestSessionId, setGuestSessionId] = useState<string | null>(null);
  const [guestSecret, setGuestSecret] = useState<string | null>(null);
  const [guestCode, setGuestCode] = useState<string | null>(null);
  const [cloudShareUrl, setCloudShareUrl] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [sendState, setSendState] = useState<SendState>("select-files");
  const [transferProgress, setTransferProgress] = useState<TransferProgress | null>(null);
  const [connectionState, setConnectionState] = useState("");
  const [countdown, setCountdown] = useState(900);

  // Receipt tracking
  const [receiverName, setReceiverName] = useState<string | null>(null);
  const [transferStartedAt, setTransferStartedAt] = useState<number | null>(null);
  const [transferCompletedAt, setTransferCompletedAt] = useState<number | null>(null);
  const [transferMethod, setTransferMethod] = useState<"direct" | "cloud">("direct");

  // Diagnostics
  const [signalingState, setSignalingState] = useState("idle");
  const [iceState, setIceState] = useState("--");
  const [dcState, setDcState] = useState("--");
  const [lastSignalType, setLastSignalType] = useState("--");

  const pollRef = useRef<PollSignaling | null>(null);
  const engineRef = useRef<WebRTCEngine | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const methodInfo = getMethodInfo(method);
  const isCloud = method === "cloud";
  const isDirect = method === "direct";

  const totalSize = selectedFiles.reduce((s, sf) => s + sf.file.size, 0);
  const isActiveTransfer = sendState === "receiver-joined" || sendState === "connecting" || sendState === "sending-file" || sendState === "verifying" || sendState === "sending-next";

  useEffect(() => {
    if (!guestSessionId || sendState === "completed" || sendState === "failed") return;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [guestSessionId, sendState]);

  // Warn before refresh during active transfer
  useEffect(() => {
    const isActive = sendState === "receiver-joined" || sendState === "connecting" || sendState === "sending-file" || sendState === "verifying" || sendState === "sending-next";
    if (isActive) {
      const handler = (e: BeforeUnloadEvent) => {
        e.preventDefault();
        e.returnValue = "";
      };
      window.addEventListener("beforeunload", handler);
      return () => window.removeEventListener("beforeunload", handler);
    }
  }, [sendState]);

  const formatCountdown = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  // ── FILE SELECTION ──
  const handleFilesPick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    if (picked.length === 0) return;

    const currentCount = selectedFiles.length;
    if (currentCount + picked.length > MAX_FILES) {
      setError(`Maximum ${MAX_FILES} files allowed. You already have ${currentCount} selected.`);
      return;
    }

    const newFiles: SelectedFile[] = [];
    for (const f of picked) {
      if (f.size > MAX_FILE_SIZE) {
        setError(`"${f.name}" is too large. Max: 50 MB per file.`);
        continue;
      }
      const currentTotal = [...selectedFiles, ...newFiles].reduce((s, sf) => s + sf.file.size, 0) + f.size;
      if (currentTotal > MAX_TOTAL_SIZE) {
        setError(`Total transfer size would exceed 500 MB limit. Max total: 500 MB.`);
        continue;
      }
      newFiles.push({
        file: f,
        id: `${f.name}-${f.size}-${f.lastModified}-${Math.random().toString(36).slice(2, 6)}`,
      });
    }

    if (newFiles.length > 0) {
      setSelectedFiles((prev) => [...prev, ...newFiles]);
      setError(null);
    }
  }, [selectedFiles.length]);

  const removeFile = useCallback((id: string) => {
    setSelectedFiles((prev) => prev.filter((sf) => sf.id !== id));
  }, []);

  // ── DIAGNOSTICS ──
  const buildDiagnosticInfo = () => ({
    sessionId: guestSessionId,
    code: guestCode,
    role: "sender",
    signalingState,
    iceState,
    dcState,
    lastSignal: lastSignalType,
    lastError: error,
    sendState,
    transferCompleted: sendState === "completed",
    bytesSent: transferProgress?.bytesTransferred ?? 0,
    expectedBytes: transferProgress?.totalBytes ?? 0,
    filesCount: selectedFiles.length,
    filesCompleted: transferProgress?.filesCompleted ?? 0,
  });

  const copyDiagnostics = async () => {
    const diag = buildDiagnosticInfo();
    const engineLog = engineRef.current?.getDiagLog() || "";
    const text = [
      "=== OpenSend Diagnostics ===",
      `Session: ${diag.sessionId ?? "--"}`,
      `Code: ${diag.code ?? "--"}`,
      `Role: ${diag.role}`,
      `State: ${diag.sendState}`,
      `Completed: ${diag.transferCompleted}`,
      `Bytes sent: ${diag.bytesSent} / ${diag.expectedBytes}`,
      `Files: ${diag.filesCompleted} / ${diag.filesCount}`,
      `Signaling: ${diag.signalingState}`,
      `ICE: ${diag.iceState}`,
      `DataChannel: ${diag.dcState}`,
      `Last signal: ${diag.lastSignal}`,
      `Last error: ${diag.lastError ?? "none"}`,
      "--- Engine Log ---",
      engineLog,
      "============================",
    ].join("\n");
    await navigator.clipboard.writeText(text);
    alert("Diagnostics copied to clipboard");
  };

  // ── CREATE GUEST SESSION ──
  const createGuestSession = useCallback(async () => {
    if (selectedFiles.length === 0) return;

    const persistHistory = () => {
      const isBatch = selectedFiles.length > 1;
      const fileNames = selectedFiles.map((sf) => sf.file.name);
      const id = `send-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      addLocalHistory({
        id,
        direction: "sent",
        fileName: isBatch ? `${selectedFiles.length} files` : fileNames[0],
        fileSize: totalSize,
        mimeType: "batch",
        peerDevice: receiverName || "Direct Transfer",
        status: "completed",
        method: transferMethod,
        transferredAt: new Date().toISOString(),
        transferType: isBatch ? "batch" : "single",
        fileCount: selectedFiles.length,
        totalSize,
        fileNames,
      });
    };

    setSending(true);
    setError(null);
    setSendState("creating");
    setSignalingState("creating-session");

    const firstFile = selectedFiles[0].file;
    try {
      const res = await fetch("/api/guest/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sender_name: guestDevice,
          file_name: selectedFiles.length === 1 ? firstFile.name : `${selectedFiles.length} files`,
          file_size: firstFile.size,
          mime_type: firstFile.type || "application/octet-stream",
          file_count: selectedFiles.length,
          total_size: totalSize,
        }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || e.details || "Failed to create session");
      }
      const data = await res.json();
      setGuestSessionId(data.session_id);
      setGuestSecret(data.transfer_secret);
      setGuestCode(data.transfer_code);

      // ── DIRECT TRANSFER ──
      if (isDirect) {
        setTransferMethod("direct");
        setSendState("waiting");
        setSignalingState("waiting-for-receiver");

        const poll = new PollSignaling();
        pollRef.current = poll;
        poll.onStateChange((s) => {
          if (s === "connecting") setSignalingState("polling");
        });

        poll.onSignal(async (msg) => {
          setLastSignalType(msg.type);

          if (msg.type === "receiver-joined") {
            // Extract receiver name from the payload
            const name = msg.payload?.receiver_name || null;
            setReceiverName(name);
            setSendState("receiver-joined");
            setTransferStartedAt(Date.now());
            setConnectionState("");
            setSignalingState("creating-offer");
            return;
          }

          // Route signals to engine once created (via useEffect below)
          if (engineRef.current) {
            await engineRef.current.handleSignal(msg);
            return;
          }
        });

        poll.start(data.session_id, data.transfer_secret, "sender");
      }

      // ── CLOUD TRANSFER ──
      if (isCloud) {
        setTransferMethod("cloud");
        setSendState("cloud-uploading");
        setTransferStartedAt(Date.now());
        setConnectionState("Uploading to cloud...");
        try {
          const formData = new FormData();
          formData.append("file", firstFile);

          const uploadRes = await fetch("/api/guest/upload", {
            method: "POST",
            headers: {
              "X-Session-Id": data.session_id,
              "X-Transfer-Code": data.transfer_code,
              "X-Transfer-Secret": data.transfer_secret,
            },
            body: formData,
          });

          if (!uploadRes.ok) {
            const e = await uploadRes.json();
            throw new Error(e.error || "Upload failed");
          }

          const uploadData = await uploadRes.json();
          setCloudShareUrl(uploadData.share_url);

          await fetch("/api/guest/sessions", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              session_id: data.session_id,
              secret: data.transfer_secret,
              status: "completed",
            }),
          });

          setTransferCompletedAt(Date.now());
          setSendState("cloud-ready");
        } catch (err: any) {
          setSendState("failed");
          setError(err.message || "Cloud upload failed");
        }
      }

    } catch (err: any) {
      setSendState("failed");
      setError(err.message || "Failed to create session");
    } finally {
      setSending(false);
    }
  }, [selectedFiles, guestDevice, isDirect, isCloud, totalSize, receiverName, transferMethod]);

  // ── ENGINE INIT: triggered when receiver joins ──
  // This runs after the poll signaling setup so we can pass the existing poll
  useEffect(() => {
    if (sendState !== "receiver-joined" || !guestSessionId || !guestSecret || !guestCode) return;
    if (engineRef.current) return; // Already created

    const runEngine = async () => {
      const poll = pollRef.current;
      if (!poll) return;

      const persistHistory = () => {
        const isBatch = selectedFiles.length > 1;
        const fileNames = selectedFiles.map((sf) => sf.file.name);
        const id = `send-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        addLocalHistory({
          id,
          direction: "sent",
          fileName: isBatch ? `${selectedFiles.length} files` : fileNames[0],
          fileSize: totalSize,
          mimeType: "batch",
          peerDevice: receiverName || "Direct Transfer",
          status: "completed",
          method: "direct",
          transferredAt: new Date().toISOString(),
          transferType: isBatch ? "batch" : "single",
          fileCount: selectedFiles.length,
          totalSize,
          fileNames,
        });
      };

      setSignalingState("creating-offer");

      const engine = new WebRTCEngine();
      engineRef.current = engine;

      engine.onProgress((p) => setTransferProgress(p));
      engine.onStateChange((s) => {
        if (s === "transferring") {
          setSendState("sending-file");
          setConnectionState("");
          setSignalingState("transferring");
          setIceState("connected");
        }
        if (s === "verifying") {
          setSendState("verifying");
          setSignalingState("verifying");
        }
        if (s === "completed") {
          setTransferCompletedAt(Date.now());
          setSendState("completed");
          setDcState("closed");
          setSignalingState("completed");
          setIceState("disconnected");
          poll.updateSessionStatus("completed");
          poll.stop();
          persistHistory();
        }
        if (s === "error") {
          const diag = engine?.getDiagLog()?.split("\n") || [];
          const lastLines = diag.slice(-5).join("; ");
          const hasIceFailure = diag.some(l => l.includes("ICE") && l.includes("failed"));
          setSendState("failed");
          if (hasIceFailure) {
            setError("Could not connect directly. Make sure both devices are on the same WiFi network, or try Cloud Transfer.");
          } else {
            setError(lastLines ? `Transfer failed: ${lastLines}` : "Connection lost during transfer.");
          }
          poll.stop();
        }
      });

      try {
        setSendState("connecting");
        setSignalingState("creating-offer");
        const dc = await engine.createConnection(guestSessionId, (m) => poll.send(m));
        setSignalingState("waiting-for-answer");

        dc.onopen = () => {
          setDcState("open");
        };
        dc.onclose = () => setDcState("closed");
        dc.onerror = () => setDcState("error");

        await new Promise<void>((resolve, reject) => {
          if (dc.readyState === "open") resolve();
          dc.onopen = () => resolve();
          const timeout = setTimeout(() => reject(new Error("DataChannel timeout")), 30000);
          dc.onopen = () => { clearTimeout(timeout); resolve(); };
        });

        setSignalingState("sending-file");
        await engine.sendFiles(selectedFiles.map((sf) => sf.file));
        poll.stop();
      } catch (err: any) {
        const diag = engine?.getDiagLog()?.split("\n").slice(-5).join("; ") || "";
        setSendState("failed");
        setError(err.message ? `${err.message}${diag ? ` (${diag})` : ""}` : `Transfer failed${diag ? `: ${diag}` : ""}`);
        poll.stop();
      }
    };

    runEngine();
  }, [sendState, guestSessionId, guestSecret, guestCode, selectedFiles, totalSize, receiverName]);

  const copyCode = async () => {
    if (!guestCode) return;
    await navigator.clipboard.writeText(guestCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const copyLink = async () => {
    if (!cloudShareUrl) return;
    await navigator.clipboard.writeText(cloudShareUrl);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const shareCode = async () => {
    if (!guestCode) return;
    if (navigator.share) {
      await navigator.share({ text: `OpenSend pair code: ${guestCode}`, url: window.location.href });
    } else {
      copyCode();
    }
  };

  const resetSend = () => {
    setGuestCode(null); setGuestSessionId(null); setGuestSecret(null);
    setSelectedFiles([]); setSendState("select-files"); setTransferProgress(null);
    setError(null); setConnectionState(""); setCloudShareUrl(null);
    setSignalingState("idle"); setIceState("--"); setDcState("--"); setLastSignalType("--");
    setReceiverName(null); setTransferStartedAt(null); setTransferCompletedAt(null);
    pollRef.current?.stop();
    engineRef.current?.cleanup();
  };

  /** Retry session creation without clearing selected files */
  const retrySession = () => {
    setGuestCode(null); setGuestSessionId(null); setGuestSecret(null);
    setSendState("select-files"); setTransferProgress(null);
    setError(null); setConnectionState(""); setCloudShareUrl(null);
    setSignalingState("idle"); setIceState("--"); setDcState("--"); setLastSignalType("--");
    setReceiverName(null); setTransferStartedAt(null); setTransferCompletedAt(null);
    pollRef.current?.stop();
    engineRef.current?.cleanup();
  };

  // ── HELPERS ──
  const errorCategory = (() => {
    if (!error) return null;
    const e = error.toLowerCase();
    if (e.includes("expired") || e.includes("expir")) return "expired";
    if (e.includes("disconnect") || e.includes("timeout") || e.includes("connection lost")) return "disconnected";
    if (e.includes("too large") || e.includes("limit")) return "too-large";
    if (e.includes("webrtc") || e.includes("not available") || e.includes("unsupported")) return "unsupported";
    return "failed";
  })();

  const formatTimestamp = (ms: number) => {
    return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDuration = (start: number, end: number) => {
    const sec = Math.round((end - start) / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    return `${min}m ${sec % 60}s`;
  };

  const progress = transferProgress;
  const isBatch = selectedFiles.length > 1;

  // ══════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════

  // ── FILE SELECTION SCREEN ──
  if (selectedFiles.length === 0) {
    return (
      <div className="space-y-8 py-4">
        <button onClick={() => router.push("/")} className="text-sm text-text-muted hover:text-text-primary transition flex items-center gap-1 cursor-pointer">
          <ArrowLeft className="size-4" /> Back
        </button>

        <div className="text-center space-y-3">
          <h1 className="text-display text-text-primary">Send files</h1>
          <p className="text-sm text-text-secondary">You are: <span className="font-bold text-text-primary">{guestDevice}</span></p>
        </div>

        <div className="text-center space-y-3">
          <p className="text-label text-text-muted">Transfer method</p>
          <div className="flex justify-center gap-2 flex-wrap">
            {TRANSFER_METHODS.map((m) => {
              const selected = method === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => { if (m.supported) setMethod(m.id); }}
                  className={`rounded-full px-4 py-2.5 text-sm font-semibold transition flex items-center gap-2 cursor-pointer ${
                    selected
                      ? "bg-accent text-white"
                      : m.supported
                        ? "bg-bg-surface-muted/30 text-text-secondary hover:text-text-primary"
                        : "bg-bg-surface-muted/10 text-text-muted cursor-not-allowed"
                  }`}
                  title={!m.supported ? m.supportMessage : ""}
                >
                  <MethodIcon id={m.id} className="size-4" />
                  {m.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-text-muted italic">{methodInfo.helperText}</p>
        </div>

        <label className="rounded-2xl p-8 sm:p-12 bg-bg-surface-muted cursor-pointer text-center transition hover:bg-bg-surface-muted/80 block">
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFilesPick}
          />
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-accent/10">
            <Upload className="size-6 text-accent" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-xl font-bold text-text-primary">Select files</p>
            <p className="text-sm text-text-muted">Click to browse &mdash; up to {MAX_FILES} files, 50 MB each</p>
            <p className="text-xs text-text-muted">Total limit: 500 MB per session</p>
          </div>
        </label>

        {error && (
          <p className="text-sm text-error text-center">
            {error}
          </p>
        )}
      </div>
    );
  }

  // ── FILES SELECTED, NOT YET CREATED ──
  if (!guestCode) {
    return (
      <div className="space-y-6 py-4">
        <button onClick={resetSend} className="text-sm text-text-muted hover:text-text-primary transition flex items-center gap-1 cursor-pointer">
          <ArrowLeft className="size-4" /> Back
        </button>

        <div className="text-center space-y-2">
          <h1 className="text-display text-text-primary">Send files</h1>
          <p className="text-sm text-text-muted">You are: <span className="font-bold text-text-primary">{guestDevice}</span></p>
          <div className="flex items-center justify-center gap-1.5 text-xs text-text-muted">
            <MethodIcon id={method} className="size-3" />
            {methodInfo.label}
            <span className="italic ml-1">&mdash; {methodInfo.helperText}</span>
          </div>
        </div>

        {/* File list */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-primary font-semibold">{selectedFiles.length} file{selectedFiles.length !== 1 ? "s" : ""} selected</span>
            <span className="text-text-primary font-bold">{formatBytes(totalSize)} total</span>
          </div>
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span>Max {MAX_FILES} files, 50 MB each</span>
            <span>500 MB limit</span>
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {selectedFiles.map((sf) => (
              <div key={sf.id} className="flex items-center justify-between gap-2 rounded-full px-4 py-2.5 bg-bg-surface-muted/50">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <File className="size-4 text-text-muted shrink-0" />
                  <span className="text-sm text-text-primary truncate">{sf.file.name}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-text-muted">{formatBytes(sf.file.size)}</span>
                  <button
                    onClick={() => removeFile(sf.id)}
                    className="text-text-secondary hover:text-error transition p-0.5"
                    title="Remove file"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          {selectedFiles.length < MAX_FILES && (
            <label className="text-xs text-text-muted hover:text-text-primary transition text-center w-full block py-1 cursor-pointer">
              + Add more files
              <input
                type="file"
                multiple
                className="hidden"
                onChange={handleFilesPick}
              />
            </label>
          )}
        </div>

        {error && <p className="text-sm text-error text-center">{error}</p>}

        <Button variant="primary" size="lg" className="w-full min-h-[56px] text-base"
          disabled={sending} onClick={createGuestSession}>
          {sending ? <Loader2 className="size-5 animate-spin" /> : <QrCode className="size-5" />}
          {sending ? "Creating session..." : "Generate pair code"}
        </Button>
      </div>
    );
  }

  // ── QR DATA ──
  const qrData = (() => {
    if (cloudShareUrl) return cloudShareUrl;
    return `${window.location.origin}/receive?code=${guestCode}&session=${guestSessionId}`;
  })();

  const showQrAndCode = sendState === "waiting" || sendState === "receiver-joined";
  const isIdleOrDone = sendState === "completed" || sendState === "failed";

  // ══════════════════════════════════════════════════════════════
  // QR + CODE + RECEIPT + PROGRESS + ALL STATES
  // ══════════════════════════════════════════════════════════════

  return (
    <div className="space-y-8 py-4">
      <button onClick={resetSend} className="text-sm text-text-muted hover:text-text-primary transition flex items-center gap-1 cursor-pointer">
        <ArrowLeft className="size-4" /> Back
      </button>

      {/* ── WAITING / QR + CODE ── */}
      {showQrAndCode && (
        <>
          <div className="text-center space-y-2">
            {sendState === "waiting" ? (
              <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-accent/10">
                <QrCode className="size-7 text-accent" />
              </div>
            ) : (
              <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-accent/20">
                <Check className="size-7 text-accent" />
              </div>
            )}
            <h1 className="text-display text-text-primary">
              {sendState === "waiting" ? "Share this code" : "Receiver joined"}
            </h1>
            <p className="text-sm text-text-muted">
              {sendState === "waiting"
                ? "Ask the receiver to open the app and enter this code"
                : receiverName
                  ? `${receiverName} is connected and ready`
                  : "Your receiver is connected"}
            </p>
          </div>

          {/* Code as hero */}
          <div className="text-center">
            <p className="text-6xl sm:text-7xl font-black text-text-primary tracking-[0.3em] select-all">
              {guestCode}
            </p>
          </div>

          {/* QR — secondary, inline */}
          <div className="flex items-center justify-center gap-6">
            <div className="bg-white p-2 rounded-xl shadow-lg shrink-0">
              <QRDisplay data={qrData} size={128} className="!shadow-none" />
            </div>
            <div className="text-left space-y-1.5">
              <p className="text-sm font-semibold text-text-primary">QR code</p>
              <p className="text-xs text-text-muted max-w-[140px]">Scan with your camera or the receive page</p>
            </div>
          </div>

          {/* Actions row */}
          <div className="flex gap-3 justify-center">
            <Button variant="primary" className="min-w-[140px]" onClick={copyCode}>
              {copiedCode ? <Check className="size-5" /> : <Copy className="size-5" />}
              {copiedCode ? "Copied!" : "Copy code"}
            </Button>
            <Button variant="secondary" className="min-w-[120px]" onClick={shareCode}>
              <Share2 className="size-5" /> Share
            </Button>
          </div>

          {/* Session metadata — inline */}
          <div className="border-y border-border-default py-3">
            <div className="flex items-center justify-center gap-6 text-xs text-text-muted">
              <span className="flex items-center gap-1.5">
                <Clock className="size-3.5" />
                {formatCountdown(countdown)}
              </span>
              {sendState === "receiver-joined" && (
                <span className="flex items-center gap-1.5 text-accent font-semibold">
                  <Check className="size-3.5" />
                  Connected
                </span>
              )}
              {sendState === "waiting" && (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="size-3.5 animate-spin" />
                  Waiting for receiver
                </span>
              )}
            </div>
          </div>

          {sendState === "waiting" && (
            <Button variant="secondary" size="lg" className="w-full" onClick={resetSend}>
              Cancel
            </Button>
          )}
        </>
      )}

      {/* ── CLOUD UPLOADING ── */}
      {sendState === "cloud-uploading" && (
        <div className="text-center space-y-6">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-accent/10">
            <Cloud className="size-7 text-accent" />
          </div>
          <h1 className="text-display text-text-primary">Uploading to cloud...</h1>
          <p className="text-sm text-text-muted">{selectedFiles.length} file{selectedFiles.length !== 1 ? "s" : ""}</p>
          <div className="flex justify-center">
            <Loader2 className="size-6 text-accent animate-spin" />
          </div>
        </div>
      )}

      {/* ── CLOUD READY ── */}
      {sendState === "cloud-ready" && cloudShareUrl && (
        <>
          <div className="text-center space-y-2">
            <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-accent/10">
              <Check className="size-7 text-accent" />
            </div>
            <h1 className="text-display text-text-primary">Upload complete</h1>
            <p className="text-sm text-text-muted">Share this link with the receiver</p>
          </div>

          {/* QR — smaller, inline */}
          <div className="flex justify-center">
            <div className="bg-white p-2 rounded-xl shadow-lg">
              <QRDisplay data={qrData} size={160} className="!shadow-none" />
            </div>
          </div>

          {/* Link */}
          <div className="text-center space-y-2">
            <p className="text-label text-text-muted">Download link</p>
            <div className="flex items-center justify-center gap-2 text-accent font-mono text-sm break-all">
              <Link className="size-4 shrink-0" />
              <span className="select-all">{cloudShareUrl}</span>
            </div>
            <Button variant="primary" onClick={copyLink}>
              {copiedCode ? <Check className="size-5" /> : <Copy className="size-5" />}
              {copiedCode ? "Copied!" : "Copy link"}
            </Button>
          </div>

          <Button variant="primary" size="lg" className="w-full" onClick={resetSend}>
            Send another file
          </Button>
        </>
      )}

      {/* ── CONNECTING ── */}
      {sendState === "connecting" && (
        <div className="text-center space-y-4">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-accent/10">
            <Loader2 className="size-7 text-accent animate-spin" />
          </div>
          <p className="text-lg font-bold text-text-primary">Creating secure connection</p>
          <p className="text-sm text-text-muted">Establishing an encrypted peer connection...</p>
          <div className="flex items-center justify-center gap-1 text-xs text-text-muted">
            <Shield className="size-3.5" />
            End-to-end encrypted
          </div>
        </div>
      )}

      {/* ── TRANSFER PROGRESS ── */}
      {(sendState === "sending-file" || sendState === "verifying") && progress && (
        <div className="text-center space-y-6">
          {/* Status icon */}
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-accent/10">
            <ArrowUpFromLine className="size-7 text-accent" />
          </div>

          {/* Current file name */}
          <div>
            <p className="text-lg font-bold text-text-primary truncate max-w-sm mx-auto">
              {sendState === "verifying" ? "Verifying..." : progress.currentFileName || "Sending..."}
            </p>
            {isBatch && (
              <p className="text-sm text-text-muted mt-1">
                File {progress.filesCompleted != null ? progress.filesCompleted + 1 : progress.currentFileIndex + 1} of {progress.fileCount}
              </p>
            )}
          </div>

          {/* Main progress bar */}
          {sendState === "sending-file" && (
            <div className="space-y-2 max-w-md mx-auto w-full">
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">{formatBytes(progress.bytesTransferred)}</span>
                <span className="text-text-primary font-bold">{progress.percent}%</span>
              </div>
              <div className="h-3 rounded-full bg-bg-surface-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-200"
                  style={{ width: `${Math.min(progress.percent, 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Batch overall progress */}
          {sendState === "sending-file" && isBatch && progress.overallPercent != null && (
            <div className="space-y-1 max-w-md mx-auto w-full">
              <div className="flex justify-between text-xs">
                <span className="text-text-muted">Overall progress</span>
                <span className="text-text-primary font-semibold">{progress.overallPercent}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-bg-surface-muted/50 overflow-hidden">
                <div
                  className="h-full rounded-full bg-accent/60 transition-all duration-200"
                  style={{ width: `${Math.min(progress.overallPercent, 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Speed + ETA strip */}
          {sendState === "sending-file" && (
            <div className="border-y border-border-default py-3 max-w-md mx-auto">
              <div className="flex justify-between text-xs text-text-muted">
                <span>{formatSpeed(progress.speedBps)}</span>
                <span>{formatETA(progress.estimatedRemainingMs)} remaining</span>
              </div>
            </div>
          )}

          {/* Verifying state */}
          {sendState === "verifying" && (
            <div className="space-y-2">
              <Loader2 className="mx-auto size-5 text-accent animate-spin" />
              <p className="text-sm text-text-muted">Checking file integrity...</p>
            </div>
          )}

          {/* Encryption note */}
          {sendState === "sending-file" && (
            <div className="flex items-center justify-center gap-1 text-xs text-text-muted">
              <Shield className="size-3.5" />
              End-to-end encrypted
            </div>
          )}
        </div>
      )}

      {/* ── COMPLETED — TRANSFER RECEIPT ── */}
      {sendState === "completed" && (
        <div className="text-center space-y-6">
          {/* Hero result */}
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-accent/10">
            <Check className="size-8 text-accent" />
          </div>
          <h1 className="text-display text-text-primary">Transfer complete</h1>
          <p className="text-sm text-text-muted">
            {isBatch
              ? `${selectedFiles.length} files sent (${formatBytes(totalSize)})`
              : `${selectedFiles[0].file.name} sent`}
          </p>

          {/* Receipt / Dashed separator + key-values */}
          <div className="border-t-2 border-dashed border-text-muted/30 pt-6 max-w-sm mx-auto w-full space-y-3">
            {/* File list */}
            <div className="space-y-2">
              {selectedFiles.map((sf) => (
                <div key={sf.id} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1 text-left">
                    <File className="size-4 text-text-muted shrink-0" />
                    <span className="text-sm text-text-primary truncate">{sf.file.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-text-muted">{formatBytes(sf.file.size)}</span>
                    <Check className="size-3.5 text-accent" />
                  </div>
                </div>
              ))}
            </div>

            {/* Divider */}
            <div className="border-t border-border-default" />

            {/* Key-value rows */}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-1.5">
                <span className="text-label text-text-muted">Received by</span>
                <span className="text-text-primary font-semibold">{receiverName || "Receiver"}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-label text-text-muted">Total size</span>
                <span className="text-text-primary font-semibold">{formatBytes(totalSize)}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-label text-text-muted">Files</span>
                <span className="text-text-primary font-semibold">{selectedFiles.length}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-label text-text-muted">Method</span>
                <span className="text-text-primary font-semibold capitalize">{transferMethod}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-label text-text-muted">Verified</span>
                <span className="text-accent font-semibold flex items-center gap-1">
                  <Check className="size-3.5" />
                  SHA-256
                </span>
              </div>
              {transferStartedAt && transferCompletedAt && (
                <div className="flex justify-between py-1.5">
                  <span className="text-label text-text-muted">Duration</span>
                  <span className="text-text-muted">{formatDuration(transferStartedAt, transferCompletedAt)}</span>
                </div>
              )}
              {transferCompletedAt && (
                <div className="flex justify-between py-1.5">
                  <span className="text-label text-text-muted">Time</span>
                  <span className="text-text-muted">{formatTimestamp(transferCompletedAt)}</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <p className="text-center text-xs text-text-muted pt-2">
              &mdash; OpenSend v0.2.13 &mdash;
            </p>
          </div>

          {/* Actions */}
          <div className="space-y-3 pt-2">
            <Button variant="primary" size="lg" className="w-full" onClick={resetSend}>
              Send another file
            </Button>
            <Button variant="secondary" size="lg" className="w-full" onClick={() => router.push("/")}>
              Back to home
            </Button>
          </div>
        </div>
      )}

      {/* ── FAILED ── */}
      {sendState === "failed" && (
        <div className="text-center space-y-6">
          {/* Distinct icon per error category */}
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-error/10">
            {errorCategory === "expired" ? (
              <Clock className="size-7 text-error" />
            ) : errorCategory === "disconnected" ? (
              <Wifi className="size-7 text-error" />
            ) : (
              <X className="size-7 text-error" />
            )}
          </div>

          {/* Distinct title per error category */}
          <h1 className="text-display text-text-primary">
            {errorCategory === "expired" && "Session expired"}
            {errorCategory === "disconnected" && "Connection lost"}
            {errorCategory === "too-large" && "File too large"}
            {errorCategory === "unsupported" && "Browser not supported"}
            {!errorCategory && "Transfer failed"}
          </h1>

          {/* Error message */}
          {error && (
            <p className="text-sm text-error max-w-sm mx-auto">{error}</p>
          )}

          {/* Actions */}
          <div className="space-y-3 pt-2">
            {errorCategory === "expired" && (
              <Button variant="primary" size="lg" className="w-full" onClick={retrySession}>
                Start a new session
              </Button>
            )}
            {errorCategory === "disconnected" && (
              <Button variant="primary" size="lg" className="w-full" onClick={retrySession}>
                Try again
              </Button>
            )}
            {(!errorCategory || errorCategory === "failed" || errorCategory === "unsupported") && (
              <>
                <Button variant="primary" size="lg" className="w-full" onClick={retrySession}>
                  Try again
                </Button>
                {errorCategory === "unsupported" && (
                  <p className="text-xs text-text-muted">Try using Chrome, Firefox, or Safari on a newer device.</p>
                )}
              </>
            )}
            <Button variant="secondary" size="lg" className="w-full" onClick={copyDiagnostics}>
              <Bug className="size-5" /> Copy diagnostics
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
