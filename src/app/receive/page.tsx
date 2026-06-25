"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine, KeyRound, Loader2, Check,
  Smartphone, ArrowLeft, Bug, Download, File,
  DownloadIcon, Clock, Wifi, Shield, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateEphemeralName } from "@/lib/ephemeral-names";
import { PollSignaling } from "@/lib/webrtc/poll-signaling";
import { WebRTCEngine, type TransferProgress, type TransferMetadata, type BatchMetadata, formatSpeed, formatETA } from "@/lib/webrtc/webrtc-engine";
import { useRouter, useSearchParams } from "next/navigation";
import { formatBytes } from "@/lib/utils";
import { addLocalHistory } from "@/lib/local-history";

type ReceiveState =
  | "idle"
  | "looking-up"
  | "joining"
  | "connected"
  | "waiting-for-sender"
  | "receiving-file"
  | "verifying"
  | "downloading-file"
  | "completed"
  | "failed";

interface ReceivedFile {
  fileName: string;
  fileSize: number;
  mimeType: string;
  checksum: string;
  blob: Blob;
  downloaded: boolean;
}

function ReceiveContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [enteredCode, setEnteredCode] = useState("");
  const [receiveState, setReceiveState] = useState<ReceiveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState("");
  const [transferProgress, setTransferProgress] = useState<TransferProgress | null>(null);
  const [deviceName] = useState(generateEphemeralName);
  const [fileName, setFileName] = useState<string | null>(null);
  const [senderName, setSenderName] = useState<string | null>(null);

  // Batch/file tracking
  const [batchInfo, setBatchInfo] = useState<BatchMetadata | null>(null);
  const [receivedFiles, setReceivedFiles] = useState<ReceivedFile[]>([]);

  // Receipt tracking
  const [transferStartedAt, setTransferStartedAt] = useState<number | null>(null);
  const [transferCompletedAt, setTransferCompletedAt] = useState<number | null>(null);

  const pollRef = useRef<PollSignaling | null>(null);
  const engineRef = useRef<WebRTCEngine | null>(null);
  const cancelledRef = useRef(false);
  const joinByCodeRef = useRef<typeof joinByCode>(null!);

  const isBatch = batchInfo && batchInfo.fileCount > 1;
  const totalBatchSize = batchInfo?.totalSize || 0;

  // ── AUTO-JOIN FROM QR URL PARAMS ──
  useEffect(() => {
    const code = searchParams.get("code");
    const sessionId = searchParams.get("session");
    if (code && sessionId && joinByCodeRef.current) {
      setEnteredCode(code.toUpperCase());
      const timer = setTimeout(() => {
        joinByCodeRef.current(code.toUpperCase(), sessionId);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const copyDiagnostics = async () => {
    const engine = engineRef.current;
    const engineDiag = engine?.getDiagnostics?.() || ({} as Record<string, unknown>);
    const engineLog = engine?.getDiagLog() || "";
    const browserDiag = (await import("@/lib/webrtc/webrtc-engine")).getBrowserDiagnostics();
    const text = [
      "=== OpenSend Diagnostics ===",
      `Code: ${enteredCode || "--"}`,
      `Role: receiver`,
      `State: ${receiveState}`,
      `Files received: ${receivedFiles.length}`,
      `Failed files: ${((engineDiag as any).receivedFailedFiles || []).join(", ") || "none"}`,
      `Reconnect attempts: ${engineDiag.reconnectAttempts ?? 0}`,
      `ICE: ${engineDiag.iceConnectionState || "--"}`,
      `DataChannel: ${engineDiag.dataChannelState || "--"}`,
      `Last error: ${error ?? "none"}`,
      "--- Browser ---",
      `UA: ${browserDiag.userAgent}`,
      `Platform: ${browserDiag.platform}`,
      `Screen: ${browserDiag.screenSize}`,
      `Connection: ${browserDiag.connectionType}`,
      `WebRTC: ${browserDiag.webRTCSupported}`,
      "--- Engine Log ---",
      engineLog,
      "============================",
    ].join("\n");
    await navigator.clipboard.writeText(text);
  };

  // ── BLOB URL MANAGEMENT ──
  const [fileUrls, setFileUrls] = useState<Array<{ fileName: string; url: string; fileSize: number }>>([]);
  const blobUrlsRef = useRef<string[]>([]);

  // Create blob URLs when files are received
  useEffect(() => {
    if (receivedFiles.length > 0 && receiveState === "completed") {
      blobUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      blobUrlsRef.current = [];

      const urls = receivedFiles.map((f) => {
        const downloadBlob = new Blob([f.blob], { type: "application/octet-stream" });
        const url = URL.createObjectURL(downloadBlob);
        blobUrlsRef.current.push(url);
        return { fileName: f.fileName, url, fileSize: f.fileSize || f.blob.size };
      });
      setFileUrls(urls);
    }
  }, [receivedFiles, receiveState]);

  const handleDownloadAll = useCallback(() => {
    if (typeof navigator.canShare === "function" && "share" in navigator && typeof File === "function") {
      try {
        const fileArray = receivedFiles.map((f) => {
          const blob = f.blob;
          return new (File as any)([blob], f.fileName, { type: blob.type || "application/octet-stream" }) as File;
        });
        if (navigator.canShare({ files: fileArray })) {
          navigator.share({ files: fileArray }).catch(() => {});
          return;
        }
      } catch (_) {}
    }
    fileUrls.forEach((fu, i) => {
      setTimeout(() => {
        const a = document.createElement("a");
        a.href = fu.url;
        a.download = fu.fileName;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }, i * 300);
    });
  }, [receivedFiles, fileUrls]);

  // Clean up blob URLs on unmount
  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      blobUrlsRef.current = [];
    };
  }, []);

  // ── JOIN BY CODE ──
  const joinByCode = useCallback(async (code?: string, sessionIdOverride?: string) => {
    cancelledRef.current = false;
    const codeToUse = (code || enteredCode).toUpperCase();
    if (!codeToUse || codeToUse.length < 4) return;

    setError(null);
    setReceiveState("looking-up");
    setConnectionState("Looking up session...");
    setBatchInfo(null);
    setReceivedFiles([]);
    setTransferStartedAt(Date.now());

    try {
      const lookupUrl = sessionIdOverride
        ? `/api/guest/sessions?session_id=${sessionIdOverride}`
        : `/api/guest/sessions?code=${codeToUse}`;

      const res = await fetch(lookupUrl);
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: "Session not found" }));
        let message: string;
        if (res.status === 404) {
          message = "Incorrect code — session not found. Check the code and try again.";
        } else if (res.status === 410) {
          message = errBody.error || "This session has expired or already been used.";
        } else {
          message = errBody.error || "Could not look up session.";
        }
        setReceiveState("idle");
        setError(message);
        return;
      }
      const data = await res.json();

      // Store sender info from session data
      if (data.sender_name) setSenderName(data.sender_name);
      if (data.file_name) setFileName(data.file_name);

      setConnectionState("Joining session...");
      setReceiveState("joining");

      const receiverName = generateEphemeralName();

      const joinRes = await fetch("/api/guest/sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: data.session_id,
          transfer_code: data.transfer_code,
          receiver_name: receiverName,
          status: "paired",
        }),
      });
      if (!joinRes.ok) {
        const e = await joinRes.json();
        let message: string;
        if (joinRes.status === 410 || joinRes.status === 404) {
          message = e.error || "Session no longer available. The code may have expired.";
        } else {
          message = e.error || "Failed to join session";
        }
        setReceiveState("idle");
        setError(message);
        return;
      }

      if (cancelledRef.current) return;

      setReceiveState("connected");
      setConnectionState("Connected");
      setFileName(data.file_name || null);

      const poll = new PollSignaling();
      pollRef.current = poll;
      const engine = new WebRTCEngine();
      engineRef.current = engine;

      engine.onProgress((p) => setTransferProgress(p));
      engine.onStateChange((s) => {
        if (s === "transferring") {
          setReceiveState("receiving-file");
          setConnectionState("");
        }
        if (s === "verifying") setReceiveState("verifying");
        if (s === "completed") {
          setTransferCompletedAt(Date.now());
          setReceiveState("completed");
          poll.updateSessionStatus("completed");
          poll.stop();

          const allFiles = engine.getDownloadedFiles();
          setReceivedFiles(allFiles.map((f) => ({
            fileName: f.fileName,
            fileSize: batchInfo?.files.find((bf) => bf.fileName === f.fileName)?.fileSize || 0,
            mimeType: "",
            checksum: f.checksum,
            blob: f.blob,
            downloaded: false,
          })));

          persistHistory(allFiles);
        }
        if (s === "error") {
          setReceiveState("failed");
          setTransferCompletedAt(Date.now());
          const diag = engine?.getDiagLog() || "";
          const hasIceFailure = diag.includes("ICE") && diag.includes("failed");
          setError(hasIceFailure
            ? "Could not connect directly. Make sure both devices are on the same WiFi network, or ask the sender to try Cloud Transfer."
            : "Transfer failed — connection lost.");
        }
      });
      engine.onMetadata((m: TransferMetadata) => {
        setConnectionState(`Receiving: ${m.fileName}`);
        setFileName(m.fileName);
      });
      engine.onBatchMetadata((m: BatchMetadata) => {
        setBatchInfo(m);
        setConnectionState(`Receiving ${m.fileCount} files (${formatBytes(m.totalSize)})`);
      });
      engine.onFileDownloaded((_fName: string, _blob: Blob) => {
        // Files collected in engine.getDownloadedFiles() on complete
      });

      poll.onSignal(async (msg) => {
        await engine.handleSignal(msg);
      });

      poll.start(data.session_id, data.transfer_code, "receiver");

      if (cancelledRef.current) return;

      await fetch("/api/guest/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: data.session_id,
          secret: data.transfer_code,
          sender_type: "receiver",
          message_type: "receiver-joined",
          payload: { receiver_name: receiverName },
        }),
      });

      setConnectionState("Waiting for sender");
      setReceiveState("waiting-for-sender");

      if (cancelledRef.current) return;

      let offerFound = false;
      const pollDeadline = Date.now() + 60000;
      while (!offerFound && !cancelledRef.current && Date.now() < pollDeadline) {
        const signals = await fetch(`/api/guest/signal?session_id=${data.session_id}`).then(r => r.json());
        for (const sig of signals || []) {
          if (sig.message_type === "offer" && sig.sender_type === "sender") {
            offerFound = true;
            setConnectionState("Connected to sender");
            const dc = await engine.acceptConnection(
              data.session_id,
              sig.payload,
              (m) => poll.send(m),
            );
            await new Promise<void>((resolve, reject) => {
              if (dc.readyState === "open") resolve();
              dc.onopen = () => resolve();
              const timeout = setTimeout(() => reject(new Error("DataChannel timeout")), 30000);
              dc.onopen = () => { clearTimeout(timeout); resolve(); };
            });
            break;
          }
        }
        if (!offerFound && !cancelledRef.current) await new Promise(r => setTimeout(r, 500));
      }
      if (!offerFound && !cancelledRef.current) {
        setReceiveState("idle");
        setError("Sender did not respond. The connection could not be established.");
      }

    } catch (err: any) {
      if (!cancelledRef.current) {
        setReceiveState("idle");
        setError(err.message || "Could not connect. Check the code and try again.");
      }
    }
  }, [enteredCode]);

  const persistHistory = (allFiles: Array<{ fileName: string; checksum: string; blob: Blob }>) => {
    const isBatch = (batchInfo?.fileCount || 1) > 1;
    const fNames = allFiles.map((f) => f.fileName);
    const id = `receive-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    addLocalHistory({
      id,
      direction: "received",
      fileName: isBatch ? `${batchInfo!.fileCount} files` : fNames[0] || "Unknown",
      fileSize: batchInfo?.totalSize || 0,
      mimeType: "batch",
      peerDevice: "Direct Transfer",
      status: "completed",
      method: "direct",
      transferredAt: new Date().toISOString(),
      transferType: isBatch ? "batch" : "single",
      fileCount: batchInfo?.fileCount || 1,
      totalSize: batchInfo?.totalSize || 0,
      fileNames: fNames,
    });
  };

  // Warn before refresh during active transfer
  useEffect(() => {
    const isActive = receiveState === "receiving-file" || receiveState === "verifying" || receiveState === "downloading-file";
    if (isActive) {
      const handler = (e: BeforeUnloadEvent) => {
        e.preventDefault();
        e.returnValue = "";
      };
      window.addEventListener("beforeunload", handler);
      return () => window.removeEventListener("beforeunload", handler);
    }
  }, [receiveState]);

  // Store joinByCode in ref for URL auto-join
  joinByCodeRef.current = joinByCode;

  const handleCodeChange = (value: string) => {
    setEnteredCode(value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
  };

  const reset = () => {
    cancelledRef.current = true;
    setReceiveState("idle");
    setError(null);
    setConnectionState("");
    setTransferProgress(null);
    setEnteredCode("");
    setFileName(null);
    setBatchInfo(null);
    setReceivedFiles([]);
    setSenderName(null);
    setTransferStartedAt(null);
    setTransferCompletedAt(null);
    pollRef.current?.stop();
    engineRef.current?.cleanup();
  };

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      pollRef.current?.stop();
      engineRef.current?.cleanup();
    };
  }, []);

  // ── HELPERS ──
  const errorCategory = (() => {
    if (!error) return null;
    const e = error.toLowerCase();
    if (e.includes("expired") || e.includes("expir") || e.includes("410")) return "expired";
    if (e.includes("disconnect") || e.includes("timeout") || e.includes("connection lost") || e.includes("did not respond")) return "disconnected";
    if (e.includes("not found") || e.includes("incorrect code") || e.includes("404")) return "not-found";
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

  // ══════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════

  // ── COMPLETED — RECEIPT + DOWNLOAD ──
  if (receiveState === "completed") {
    return (
      <div className="text-center space-y-6 py-6">
        {/* Hero result */}
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-accent/10">
          <Check className="size-8 text-accent" />
        </div>
        <h1 className="text-display text-text-primary">Transfer complete</h1>
        <p className="text-sm text-text-muted">
          {isBatch
            ? `${batchInfo!.fileCount} files (${formatBytes(batchInfo!.totalSize)})`
            : `${fileName || "File"} received`}
        </p>

        {/* Receipt / Dashed separator */}
        <div className="border-t-2 border-dashed border-text-muted/30 pt-6 max-w-sm mx-auto w-full space-y-3">
          {/* File list with verified checkmarks */}
          {fileUrls.length > 0 && (
            <div className="space-y-2">
              {fileUrls.map((fu, i) => (
                <a
                  key={i}
                  href={fu.url}
                  download={fu.fileName}
                  className="flex items-center justify-between gap-2 rounded-full px-5 py-3 bg-bg-surface-muted/30 hover:bg-bg-surface-muted/50 transition cursor-pointer no-underline"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1 text-left">
                    <File className="size-4 text-text-muted shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-text-primary truncate">{fu.fileName}</p>
                      <p className="text-xs text-text-muted">{formatBytes(fu.fileSize)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-accent font-semibold flex items-center gap-1">
                      <Check className="size-3" />
                      verified
                    </span>
                    <Download className="size-4 text-accent" />
                  </div>
                </a>
              ))}
            </div>
          )}

          {/* Download All */}
          {fileUrls.length > 1 && (
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={handleDownloadAll}
            >
              <DownloadIcon className="size-5" /> Download all files
            </Button>
          )}

          {/* Divider */}
          <div className="border-t border-border-default" />

          {/* Key-value rows */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between py-1.5">
              <span className="text-label text-text-muted">From</span>
              <span className="text-text-primary font-semibold">{senderName || "Sender"}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-label text-text-muted">Total size</span>
              <span className="text-text-primary font-semibold">{formatBytes(totalBatchSize)}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-label text-text-muted">Files</span>
              <span className="text-text-primary font-semibold">{batchInfo?.fileCount || receivedFiles.length}</span>
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
            &mdash; OpenSend v0.4.0 &mdash;
          </p>
        </div>

        <Button variant="primary" onClick={() => router.push("/")}>
          Back to home
        </Button>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // IDLE / CODE ENTRY
  // ══════════════════════════════════════════════════════════════
  return (
    <div className="space-y-8 py-6">
      <button onClick={() => { reset(); router.push("/"); }}
        className="text-sm text-text-muted hover:text-text-primary transition flex items-center gap-1 cursor-pointer">
        <ArrowLeft className="size-4" /> Back
      </button>

      <div className="text-center space-y-4">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-accent/10">
          <ArrowDownToLine className="size-7 text-accent" />
        </div>
        <h1 className="text-display text-text-primary">Receive files</h1>
        <p className="text-sm text-text-muted">
          You are: <span className="font-bold text-text-primary">{deviceName}</span>
        </p>
      </div>

      {/* ── IDLE: CODE ENTRY ── */}
      {receiveState === "idle" && (
        <>
          <div className="text-center space-y-2">
            <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full bg-accent/10">
              <KeyRound className="size-5 text-accent" />
            </div>
            <h2 className="text-lg font-bold text-text-primary">Enter pair code</h2>
            <p className="text-sm text-text-muted">Ask the sender for their 6-character code</p>
          </div>

          {/* Code input — hero */}
          <div className="text-center">
            <input
              value={enteredCode}
              onChange={(e) => handleCodeChange(e.target.value)}
              placeholder="A7K9P2"
              maxLength={6}
              className="w-full text-center text-3xl sm:text-4xl font-black tracking-[0.3em] rounded-full px-6 py-5 bg-bg-surface-muted text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <Button variant="primary" size="lg" className="w-full min-h-[56px] text-base"
            disabled={enteredCode.length < 4} onClick={() => joinByCode()}>
            <KeyRound className="size-5" /> Join
          </Button>

          {/* QR info — inline */}
          <div className="border-y border-border-default py-4">
            <p className="text-xs text-text-muted text-center">
              Use your phone camera to scan the sender&apos;s QR code &mdash; the receive page opens automatically.
            </p>
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-error text-center">{error}</p>
          )}
        </>
      )}

      {/* ── LOOKING UP / JOINING / CONNECTED / WAITING FOR SENDER ── */}
      {(receiveState === "looking-up" || receiveState === "joining" || receiveState === "connected" ||
        receiveState === "waiting-for-sender") && (
        <div className="text-center space-y-6">
          {/* Status icon */}
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-accent/10">
            {receiveState === "waiting-for-sender" ? (
              <ArrowDownToLine className="size-7 text-accent" />
            ) : receiveState === "connected" ? (
              <Check className="size-7 text-accent" />
            ) : (
              <Loader2 className="size-7 text-accent animate-spin" />
            )}
          </div>

          {/* Status title */}
          <div>
            <p className="text-lg font-bold text-text-primary">
              {receiveState === "looking-up" && "Looking up session"}
              {receiveState === "joining" && "Joining session"}
              {receiveState === "connected" && "Connected"}
              {receiveState === "waiting-for-sender" && "Waiting for sender"}
            </p>
            {connectionState && (
              <p className="text-sm text-text-muted mt-1">{connectionState}</p>
            )}
          </div>

          {/* Sender / file info strip */}
          {(senderName || fileName) && (
            <div className="border-y border-border-default py-3 max-w-sm mx-auto w-full">
              <div className="space-y-1 text-sm">
                {senderName && (
                  <div className="flex justify-between">
                    <span className="text-label text-text-muted">Sender</span>
                    <span className="text-text-primary font-semibold">{senderName}</span>
                  </div>
                )}
                {fileName && (
                  <div className="flex justify-between">
                    <span className="text-label text-text-muted">File</span>
                    <span className="text-text-primary truncate max-w-[180px]">{fileName}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {receiveState === "waiting-for-sender" && (
            <div className="flex items-center justify-center gap-1 text-xs text-text-muted">
              <Shield className="size-3.5" />
              End-to-end encrypted
            </div>
          )}
        </div>
      )}

      {/* ── RECEIVING FILE / VERIFYING ── */}
      {(receiveState === "receiving-file" || receiveState === "verifying") && (
        <div className="text-center space-y-6">
          {/* Status icon */}
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-accent/10">
            <ArrowDownToLine className="size-7 text-accent" />
          </div>

          {/* Current file */}
          <div>
            <p className="text-lg font-bold text-text-primary truncate max-w-sm mx-auto">
              {receiveState === "verifying" ? "Verifying..." : progress?.currentFileName || "Receiving..."}
            </p>
            {isBatch && progress && (
              <p className="text-sm text-text-muted mt-1">
                File {progress.filesCompleted != null ? progress.filesCompleted + 1 : 1} of {progress.fileCount}
              </p>
            )}
          </div>

          {/* Progress bar */}
          {receiveState === "receiving-file" && progress && (
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
          {receiveState === "receiving-file" && isBatch && progress?.overallPercent != null && (
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
          {receiveState === "receiving-file" && progress && (
            <div className="border-y border-border-default py-3 max-w-md mx-auto">
            <div className="flex justify-between text-xs text-text-muted">
              <span>{formatSpeed(progress.speedAvgBps || progress.speedBps)}</span>
              <span>{formatETA(progress.estimatedRemainingMs)} remaining</span>
            </div>
            </div>
          )}

          {/* Verifying */}
          {receiveState === "verifying" && (
            <div className="space-y-2">
              <Loader2 className="mx-auto size-5 text-accent animate-spin" />
              <p className="text-sm text-text-muted">Checking file integrity...</p>
            </div>
          )}

          {/* Encryption note */}
          {receiveState === "receiving-file" && (
            <div className="flex items-center justify-center gap-1 text-xs text-text-muted">
              <Shield className="size-3.5" />
              End-to-end encrypted
            </div>
          )}

          {/* Cancel button during receive */}
          {receiveState === "receiving-file" && (
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={reset}
            >
              <X className="size-4" /> Cancel transfer
            </Button>
          )}
        </div>
      )}

      {/* ── FAILED ── */}
      {receiveState === "failed" && (
        <div className="text-center space-y-6">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-error/10">
            {errorCategory === "expired" ? (
              <Clock className="size-7 text-error" />
            ) : errorCategory === "disconnected" ? (
              <Wifi className="size-7 text-error" />
            ) : errorCategory === "not-found" ? (
              <KeyRound className="size-7 text-error" />
            ) : (
              <X className="size-7 text-error" />
            )}
          </div>

          <h1 className="text-display text-text-primary">
            {errorCategory === "expired" && "Session expired"}
            {errorCategory === "disconnected" && "Connection lost"}
            {errorCategory === "not-found" && "Code not found"}
            {!errorCategory && "Transfer failed"}
          </h1>

          {error && (
            <p className="text-sm text-error max-w-sm mx-auto">{error}</p>
          )}

          <div className="space-y-3 pt-2">
            <Button variant="primary" size="lg" className="w-full" onClick={reset}>
              {errorCategory === "not-found" ? "Try again" : "Start over"}
            </Button>
            <Button variant="secondary" className="w-full" onClick={copyDiagnostics}>
              <Bug className="size-5" /> Copy diagnostics
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReceivePage() {
  return (
    <Suspense fallback={
      <div className="text-center py-20">
        <Loader2 className="mx-auto size-8 text-accent animate-spin" />
      </div>
    }>
      <ReceiveContent />
    </Suspense>
  );
}
