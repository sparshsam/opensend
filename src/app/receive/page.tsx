"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine, KeyRound, Loader2, Check,
  Smartphone, ArrowLeft, Bug, Download, File,
  DownloadIcon,
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

  // Batch/file tracking
  const [batchInfo, setBatchInfo] = useState<BatchMetadata | null>(null);
  const [receivedFiles, setReceivedFiles] = useState<ReceivedFile[]>([]);

  const pollRef = useRef<PollSignaling | null>(null);
  const engineRef = useRef<WebRTCEngine | null>(null);
  const cancelledRef = useRef(false);
  const joinByCodeRef = useRef<typeof joinByCode>(null!);

  const isBatch = batchInfo && batchInfo.fileCount > 1;

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
    const diagLog = engineRef.current?.getDiagLog() || "";
    const text = [
      "=== OpenSend Diagnostics ===",
      `Code: ${enteredCode || "--"}`,
      `Role: receiver`,
      `State: ${receiveState}`,
      `Files received: ${receivedFiles.length}`,
      `Last error: ${error ?? "none"}`,
      "--- Engine Log ---",
      diagLog,
      "============================",
    ].join("\n");
    await navigator.clipboard.writeText(text);
  };

  // ── BLOB URL MANAGEMENT ──
  // Store blob URLs so we can render <a download> links (works on iOS)
  const [fileUrls, setFileUrls] = useState<Array<{ fileName: string; url: string; fileSize: number }>>([]);
  const blobUrlsRef = useRef<string[]>([]);

  // Create blob URLs when files are received
  // Use application/octet-stream so iOS shows a download prompt (not inline preview)
  useEffect(() => {
    if (receivedFiles.length > 0 && receiveState === "completed") {
      // Revoke old blob URLs
      blobUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      blobUrlsRef.current = [];

      const urls = receivedFiles.map((f) => {
        // Use octet-stream to force download prompt on iOS (especially for PDF, images)
        const downloadBlob = new Blob([f.blob], { type: "application/octet-stream" });
        const url = URL.createObjectURL(downloadBlob);
        blobUrlsRef.current.push(url);
        return { fileName: f.fileName, url, fileSize: f.fileSize || f.blob.size };
      });
      setFileUrls(urls);
    }
  }, [receivedFiles, receiveState]);

  const handleDownloadAll = useCallback(() => {
    // Try Web Share API on iOS (share all files at once via share sheet)
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
    // Fallback: download sequentially with delays so browser processes each one
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

    try {
      const lookupUrl = sessionIdOverride
        ? `/api/guest/sessions?session_id=${sessionIdOverride}`
        : `/api/guest/sessions?code=${codeToUse}`;

      const res = await fetch(lookupUrl);
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: "Session not found" }));
        // Stay on code entry screen, show specific error
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
      setConnectionState("Connected to sender");
      setFileName(data.file_name || null);

      const poll = new PollSignaling();
      pollRef.current = poll;
      const engine = new WebRTCEngine();
      engineRef.current = engine;

      engine.onProgress((p) => setTransferProgress(p));
      engine.onStateChange((s) => {
        if (s === "transferring") setReceiveState("receiving-file");
        if (s === "verifying") setReceiveState("verifying");
        if (s === "completed") {
          setReceiveState("completed");
          poll.updateSessionStatus("completed");
          poll.stop();

          // Gather all received files from engine and save to history
          const allFiles = engine.getDownloadedFiles();
          setReceivedFiles(allFiles.map((f) => ({
            fileName: f.fileName,
            fileSize: batchInfo?.files.find((bf) => bf.fileName === f.fileName)?.fileSize || 0,
            mimeType: "",
            checksum: f.checksum,
            blob: f.blob,
            downloaded: false,
          })));

          // No auto-download — user taps download links on completion page
          persistHistory(allFiles);
        }
        if (s === "error") {
          setReceiveState("failed");
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
      engine.onFileDownloaded((fName: string, _blob: Blob) => {
        // We don't need to track per-file here — engine.getDownloadedFiles() is called on complete
      });

      // CRITICAL: Route incoming signals (ICE candidates, etc.) to the engine
      // Without this, the iPhone sender's ICE candidates are never processed
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
      const pollDeadline = Date.now() + 60000; // 1 min max wait
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

  // ── COMPLETED: Show ALL files ──
  if (receiveState === "completed") {
    return (
      <div className="space-y-8 text-center py-10">
        <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-accent/10">
          <Check className="size-10 text-accent" />
        </div>
        <h1 className="text-display text-text-primary">Transfer complete</h1>
        <p className="text-sm text-text-muted">
          {isBatch
            ? `${batchInfo!.fileCount} files (${formatBytes(batchInfo!.totalSize)})`
            : `${fileName || "File"} received`}
        </p>

        {/* File list — every file as a tap-to-download link */}
        {fileUrls.length > 0 && (
          <div className="space-y-3 max-w-sm mx-auto">
            {/* Download All button */}
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
            {/* Per-file download links — works on iOS because it's a direct user gesture */}
            <div className="space-y-2">
              {fileUrls.map((fu, i) => (
                <a
                  key={i}
                  href={fu.url}
                  download={fu.fileName}
                  className="rounded-full px-5 py-3.5 bg-bg-surface-muted/30 flex items-center justify-between gap-3 hover:bg-bg-surface-muted/50 transition cursor-pointer no-underline"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1 text-left">
                    <File className="size-4 text-text-muted shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-text-primary truncate">{fu.fileName}</p>
                      <p className="text-xs text-text-muted">
                        {formatBytes(fu.fileSize)}
                        <span className="text-accent ml-1">✓ verified</span>
                      </p>
                    </div>
                  </div>
                  <Download className="size-4 text-accent shrink-0" />
                </a>
              ))}
            </div>

            <p className="text-xs text-text-muted">
              Tap a file to download it. Your browser will prompt you where to save it.
            </p>
          </div>
        )}

        <Button variant="primary" onClick={() => router.push("/")}>
          Back to home
        </Button>
      </div>
    );
  }

  const progress = transferProgress;

  return (
    <div className="space-y-8 py-10 max-w-md mx-auto">
      <button onClick={() => { reset(); router.push("/"); }}
        className="text-sm text-text-muted hover:text-text-primary transition flex items-center gap-1 cursor-pointer">
        <ArrowLeft className="size-4" /> Back
      </button>

      <div className="text-center space-y-4">
        <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-accent/10">
          <ArrowDownToLine className="size-10 text-accent" />
        </div>
        <h1 className="text-display text-text-primary">Receive files</h1>
        <p className="text-sm text-text-muted">
          You are: <span className="font-bold text-text-primary">{deviceName}</span>
        </p>
      </div>

      {receiveState === "idle" && (
        <>
          {/* Code entry first — this is the primary action on this page */}
          <div className="text-center space-y-2">
            <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full bg-accent/10">
              <KeyRound className="size-5 text-accent" />
            </div>
            <h2 className="text-lg font-bold text-text-primary">Enter pair code</h2>
            <p className="text-sm text-text-muted">Ask the sender for their 6-character code</p>
          </div>

          <input
            value={enteredCode}
            onChange={(e) => handleCodeChange(e.target.value)}
            placeholder="A7K9P2"
            maxLength={6}
            className="w-full text-center text-3xl sm:text-4xl font-black tracking-[0.3em] rounded-full px-6 py-5 bg-bg-surface-muted text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
          />

          <Button variant="primary" size="lg" className="w-full min-h-[56px] text-base"
            disabled={enteredCode.length < 4} onClick={() => joinByCode()}>
            <KeyRound className="size-5" /> Join
          </Button>

          {/* QR info — secondary, informational */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border-default" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-bg-base px-3 text-text-muted">or scan QR</span>
            </div>
          </div>

          <div className="rounded-2xl p-6 bg-bg-surface-muted text-center space-y-2">
            <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-accent/10">
              <Smartphone className="size-5 text-accent" />
            </div>
            <p className="text-sm text-text-muted">
              Use your phone camera to scan the sender&apos;s QR code. The receive page will open automatically.
            </p>
          </div>

          {/* Error shown inline on code entry screen */}
          {error && (
            <div className="rounded-2xl p-4 bg-error/10 text-center">
              <p className="text-sm text-error">{error}</p>
            </div>
          )}
        </>
      )}

      {(receiveState === "looking-up" || receiveState === "joining" || receiveState === "connected" ||
        receiveState === "waiting-for-sender" || receiveState === "receiving-file" || receiveState === "verifying") && (
        <div className="rounded-2xl p-8 bg-bg-surface-muted space-y-4 text-center">
          <Loader2 className="mx-auto size-8 text-accent animate-spin" />
          <p className="text-lg font-bold text-text-primary">
            {receiveState === "receiving-file" && progress?.currentFileName
              ? `Receiving: ${progress.currentFileName}`
              : receiveState === "verifying"
                ? "Verifying file..."
                : receiveState === "looking-up"
                  ? "Looking up session..."
                  : receiveState === "joining"
                    ? "Joining session..."
                    : receiveState === "waiting-for-sender"
                      ? "Waiting for sender..."
                      : "Connected"}
          </p>
          {connectionState && (
            <p className="text-sm text-text-muted">{connectionState}</p>
          )}

          {/* Batch file count */}
          {isBatch && progress && (
            <p className="text-xs text-text-muted">
              File {progress.filesCompleted != null ? progress.filesCompleted + 1 : 1} of {progress.fileCount}
            </p>
          )}

          {(receiveState === "receiving-file" || receiveState === "verifying") && progress && (
            <div className="space-y-3">
              {/* Current file name */}
              {progress.currentFileName && (
                <p className="text-xs text-text-muted truncate">{progress.currentFileName}</p>
              )}

              {/* Current file progress bar */}
              <div className="h-3 rounded-full bg-bg-base overflow-hidden">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-200"
                  style={{ width: `${Math.min(progress.percent, 100)}%` }}
                />
              </div>

              {/* Overall batch progress */}
              {isBatch && progress.overallPercent != null && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-text-muted">Overall</span>
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
                <span>
                  {isBatch && progress.filesCompleted != null
                    ? `${progress.filesCompleted} of ${progress.fileCount} files`
                    : `${progress.percent}%`}
                </span>
                <span>{formatETA(progress.estimatedRemainingMs)}</span>
              </div>
            </div>
          )}

          {/* Verifying */}
          {receiveState === "verifying" && (
            <div className="text-xs text-text-muted">Checking integrity...</div>
          )}
        </div>
      )}

      {receiveState === "failed" && (
        <div className="rounded-2xl p-8 bg-bg-surface-muted text-center space-y-4">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-error/10">
            <Loader2 className="size-6 text-error" />
          </div>
          <p className="text-lg font-bold text-text-primary">Transfer failed</p>
          {error && <p className="text-sm text-error">{error}</p>}
          <Button variant="primary" onClick={reset}>Try again</Button>
          <Button variant="secondary" onClick={copyDiagnostics} className="w-full">
            <Bug className="size-5" /> Copy diagnostics
          </Button>
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
