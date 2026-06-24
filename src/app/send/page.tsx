"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import {
  Upload, ArrowUpFromLine, QrCode, Copy, Check, Loader2,
  Wifi, Cloud, Bluetooth, ArrowLeft, Share2, Link,
  Bug, X, File,
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

    // Check max files
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
        peerDevice: "Direct Transfer",
        status: "completed",
        method: "direct",
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
        setSendState("waiting");
        setSignalingState("waiting-for-receiver");

        const poll = new PollSignaling();
        pollRef.current = poll;
        poll.onStateChange((s) => {
          if (s === "connecting") setSignalingState("polling");
        });

        let engine: WebRTCEngine | null = null;

        poll.onSignal(async (msg) => {
          setLastSignalType(msg.type);

          if (engine) {
            await engine.handleSignal(msg);
            return;
          }

          if (msg.type === "receiver-joined") {
            setSendState("receiver-joined");
            setConnectionState("");
            setSignalingState("creating-offer");

            engine = new WebRTCEngine();
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
              const dc = await engine.createConnection(data.session_id, (m) => poll.send(m));
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
              // Send all files as batch
              await engine.sendFiles(selectedFiles.map((sf) => sf.file));
              poll.stop();
            } catch (err: any) {
              const diag = engine?.getDiagLog()?.split("\n").slice(-5).join("; ") || "";
              setSendState("failed");
              setError(err.message ? `${err.message}${diag ? ` (${diag})` : ""}` : `Transfer failed${diag ? `: ${diag}` : ""}`);
              poll.stop();
            }
          }
        });

        poll.start(data.session_id, data.transfer_secret, "sender");
      }

      // ── CLOUD TRANSFER ──
      if (isCloud) {
        setSendState("cloud-uploading");
        setConnectionState("Uploading to cloud...");
        try {
          // For cloud, upload first file (simplified — multi-file cloud is future)
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
  }, [selectedFiles, guestDevice, isDirect, isCloud, totalSize]);

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
    pollRef.current?.stop();
    engineRef.current?.cleanup();
  };

  /** Retry session creation without clearing selected files */
  const retrySession = () => {
    setGuestCode(null); setGuestSessionId(null); setGuestSecret(null);
    setSendState("select-files"); setTransferProgress(null);
    setError(null); setConnectionState(""); setCloudShareUrl(null);
    setSignalingState("idle"); setIceState("--"); setDcState("--"); setLastSignalType("--");
    pollRef.current?.stop();
    engineRef.current?.cleanup();
  };

  // ── FILE SELECTION SCREEN ──
  if (selectedFiles.length === 0) {
    return (
      <div className="space-y-6 py-4">
        <button onClick={() => router.push("/")} className="text-sm text-text-muted hover:text-text-primary transition flex items-center gap-1 cursor-pointer">
          <ArrowLeft className="size-4" /> Back
        </button>

        <div className="text-center space-y-2">
          <h1 className="text-display text-text-primary">Send files</h1>
          <p className="text-sm text-text-muted">You are: <span className="font-bold text-text-primary">{guestDevice}</span></p>
        </div>

        <div className="space-y-3">
          <p className="text-label text-text-muted text-center">Transfer method</p>
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
          <p className="text-xs text-text-muted text-center italic">{methodInfo.helperText}</p>
        </div>

        <label
          className="rounded-2xl p-8 sm:p-12 bg-bg-surface-muted cursor-pointer text-center transition hover:bg-bg-surface-muted/80 block"
        >
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

        {error && <p className="text-sm text-error text-center">{error}</p>}
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
        <div className="rounded-2xl p-6 bg-bg-surface-muted space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-primary font-semibold">{selectedFiles.length} file{selectedFiles.length !== 1 ? "s" : ""} selected</span>
            <span className="text-text-primary font-bold">{formatBytes(totalSize)} total</span>
          </div>
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span>Max {MAX_FILES} files, 50 MB each</span>
            <span>Session limit: 500 MB</span>
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

  const progress = transferProgress;
  const isBatch = selectedFiles.length > 1;

  return (
    <div className="space-y-8 py-4">
      <button onClick={resetSend} className="text-sm text-text-muted hover:text-text-primary transition flex items-center gap-1">
        <ArrowLeft className="size-4" /> Back
      </button>

      {/* ── STATUS HEADERS ── */}
      {showQrAndCode && (
        <div className="text-center space-y-2">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-accent/10">
            <QrCode className="size-8 text-accent" />
          </div>
          <h1 className="text-display text-text-primary">Share this code</h1>
          <p className="text-sm text-text-muted">Ask the receiver to scan the QR or enter the code</p>
        </div>
      )}

      {sendState === "cloud-uploading" && (
        <div className="text-center space-y-4">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-accent/10">
            <Cloud className="size-8 text-accent" />
          </div>
          <h1 className="text-display text-text-primary">Uploading to cloud...</h1>
          <p className="text-sm text-text-muted">{selectedFiles.length} file{selectedFiles.length !== 1 ? "s" : ""}</p>
          <Loader2 className="mx-auto size-6 text-accent animate-spin" />
        </div>
      )}

      {sendState === "cloud-ready" && cloudShareUrl && (
        <div className="text-center space-y-2">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-accent/10">
            <Check className="size-8 text-accent" />
          </div>
          <h1 className="text-display text-text-primary">Upload complete!</h1>
          <p className="text-sm text-text-muted">Share this link or QR code with the receiver</p>
        </div>
      )}

      {isActiveTransfer && (
        <div className="text-center space-y-2">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-accent/10">
            <Loader2 className="size-8 text-accent animate-spin" />
          </div>
          <h1 className="text-display text-text-primary">{STATE_LABELS[sendState]}</h1>
          {connectionState && <p className="text-sm text-text-muted">{connectionState}</p>}
        </div>
      )}

      {sendState === "completed" && (
        <div className="text-center space-y-4">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-accent/10">
            <Check className="size-8 text-accent" />
          </div>
          <h1 className="text-display text-text-primary">Transfer complete</h1>
          <p className="text-sm text-text-muted">{selectedFiles.length} file{selectedFiles.length !== 1 ? "s" : ""} ({formatBytes(totalSize)}) sent successfully</p>

          {/* File list for sender */}
          {isBatch && (
            <div className="space-y-2 max-w-sm mx-auto">
              {selectedFiles.map((sf) => (
                <div
                  key={sf.id}
                  className="rounded-full px-5 py-3 bg-bg-surface-muted/30 flex items-center gap-2"
                >
                  <File className="size-4 text-text-muted shrink-0" />
                  <span className="text-sm text-text-primary truncate">{sf.file.name}</span>
                  <span className="text-xs text-text-muted shrink-0 ml-auto">{formatBytes(sf.file.size)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {sendState === "failed" && (
        <div className="text-center space-y-2">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-error/10">
            <Loader2 className="size-8 text-error" />
          </div>
          <h1 className="text-display text-text-primary">Failed</h1>
          {error && <p className="text-sm text-error">{error}</p>}
        </div>
      )}

      {/* ── QR + CODE SECTION ── */}
      {showQrAndCode && (
        <>
          <div className="flex justify-center">
            <div className="bg-white p-3 sm:p-4 rounded-2xl shadow-lg">
              <QRDisplay data={qrData} size={240} />
            </div>
          </div>

          <div className="rounded-2xl p-6 bg-bg-surface-muted space-y-4 text-center">
            <p className="text-5xl sm:text-6xl font-black text-text-primary tracking-[0.25em] select-all">
              {guestCode}
            </p>
            <p className="text-sm text-text-muted">
              Session expires in <span className="font-mono font-bold text-text-primary">{formatCountdown(countdown)}</span>
            </p>
            <div className="flex gap-3">
              <Button variant="primary" className="flex-1" onClick={copyCode}>
                {copiedCode ? <Check className="size-5" /> : <Copy className="size-5" />}
                {copiedCode ? "Copied!" : "Copy code"}
              </Button>
              <Button variant="secondary" className="flex-1" onClick={shareCode}>
                <Share2 className="size-5" /> Share
              </Button>
            </div>
          </div>

          <div className="text-center space-y-1">
            <Loader2 className="mx-auto size-5 text-accent animate-spin" />
            <p className="text-sm text-text-muted">
              {sendState === "receiver-joined" ? "Receiver joined" : "Waiting for receiver"}
            </p>
          </div>

          <Button variant="secondary" size="lg" className="w-full" onClick={resetSend}>
            Cancel
          </Button>
        </>
      )}

      {/* ── CLOUD READY ── */}
      {sendState === "cloud-ready" && cloudShareUrl && (
        <>
          <div className="flex justify-center">
            <div className="bg-white p-3 sm:p-4 rounded-2xl shadow-lg">
              <QRDisplay data={qrData} size={240} />
            </div>
          </div>

          <div className="rounded-2xl p-6 bg-bg-surface-muted space-y-4 text-center">
            <p className="text-sm text-text-muted">Download link</p>
            <div className="flex items-center justify-center gap-2 text-accent font-mono text-sm break-all">
              <Link className="size-4 shrink-0" />
              <span className="select-all">{cloudShareUrl}</span>
            </div>
            <div className="flex gap-3">
              <Button variant="primary" className="flex-1" onClick={copyLink}>
                {copiedCode ? <Check className="size-5" /> : <Copy className="size-5" />}
                {copiedCode ? "Copied!" : "Copy link"}
              </Button>
            </div>
          </div>

          <Button variant="primary" size="lg" className="w-full" onClick={resetSend}>
            Send another file
          </Button>
        </>
      )}

      {/* ── BATCH PROGRESS ── */}
      {(sendState === "sending-file" || sendState === "verifying") && progress && (
        <div className="rounded-2xl p-6 bg-bg-surface-muted space-y-4">
          {/* File count and current file info */}
          {isBatch && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-muted">
                File {progress.filesCompleted != null ? progress.filesCompleted + 1 : progress.currentFileIndex + 1} of {progress.fileCount}
              </span>
              <span className="text-text-primary font-bold">
                {progress.currentFileName || ""}
              </span>
            </div>
          )}

          {/* Current file progress bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">{formatBytes(progress.bytesTransferred)}</span>
              <span className="text-text-primary font-bold">{progress.percent}%</span>
            </div>
            <div className="h-3 rounded-full bg-bg-base overflow-hidden">
              <div
                className="h-full rounded-full bg-accent transition-all duration-200"
                style={{ width: `${Math.min(progress.percent, 100)}%` }}
              />
            </div>
          </div>

          {/* Overall batch progress */}
          {isBatch && progress.overallPercent != null && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-text-muted">Overall progress</span>
                <span className="text-text-primary font-bold">{progress.overallPercent}%</span>
              </div>
              <div className="h-2 rounded-full bg-bg-base/50 overflow-hidden">
                <div
                  className="h-full rounded-full bg-accent/60 transition-all duration-200"
                  style={{ width: `${Math.min(progress.overallPercent, 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Speed + ETA */}
          <div className="flex justify-between text-xs text-text-muted">
            <span>{formatSpeed(progress.speedBps)}</span>
            {isBatch && progress.filesCompleted != null && (
              <span>{progress.filesCompleted} of {progress.fileCount} files</span>
            )}
            <span>{formatETA(progress.estimatedRemainingMs)}</span>
          </div>
        </div>
      )}

      {/* ── CONNECTING INDICATOR ── */}
      {sendState === "connecting" && (
        <div className="rounded-2xl p-6 bg-bg-surface-muted text-center space-y-2">
          <Loader2 className="mx-auto size-6 text-accent animate-spin" />
          <p className="text-sm text-text-muted">Creating secure connection...</p>
        </div>
      )}

      {/* ── COMPLETED / FAILED ACTIONS ── */}
      {isIdleOrDone && (
        <div className="space-y-3">
          {sendState === "completed" && (
            <>
              <Button variant="primary" size="lg" className="w-full" onClick={resetSend}>
                Send another file
              </Button>
              <Button variant="secondary" size="lg" className="w-full" onClick={() => router.push("/")}>
                Back to home
              </Button>
            </>
          )}
          {sendState === "failed" && (
            <>
              <Button variant="primary" size="lg" className="w-full" onClick={retrySession}>
                Try again
              </Button>
              <Button variant="secondary" size="lg" className="w-full" onClick={copyDiagnostics}>
                <Bug className="size-5" /> Copy diagnostics
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
