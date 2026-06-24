"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import {
  Upload, ArrowUpFromLine, QrCode, Copy, Check, Loader2,
  Wifi, Cloud, Bluetooth, ArrowLeft, Share2, Link,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { QRDisplay } from "@/components/qr-display";
import { generateEphemeralName } from "@/lib/ephemeral-names";
import { formatBytes } from "@/lib/utils";
import { PollSignaling } from "@/lib/webrtc/poll-signaling";
import { WebRTCEngine, type TransferProgress, type TransferMetadata } from "@/lib/webrtc/webrtc-engine";
import { TRANSFER_METHODS, getDefaultMethod, type TransferMethod, getMethodInfo } from "@/lib/transfer-methods";
import { useRouter } from "next/navigation";

type SendState =
  | "select-file"
  | "creating"
  | "waiting"             // Direct: QR/code shown, waiting for receiver
  | "cloud-uploading"     // Cloud: uploading to storage
  | "cloud-ready"         // Cloud: upload done, show download link
  | "receiver-joined"
  | "connecting"
  | "transferring"
  | "verifying"
  | "completed"
  | "failed";

const STATE_LABELS: Record<SendState, string> = {
  "select-file": "Select a file",
  "creating": "Creating session...",
  "waiting": "Waiting for receiver",
  "cloud-uploading": "Uploading to cloud...",
  "cloud-ready": "Ready to share",
  "receiver-joined": "Receiver joined! Connecting...",
  "connecting": "Establishing connection...",
  "transferring": "Transferring...",
  "verifying": "Verifying checksum...",
  "completed": "Transfer complete!",
  "failed": "Transfer failed",
};

function MethodIcon({ id, className }: { id: TransferMethod; className?: string }) {
  if (id === "direct") return <Wifi className={className} />;
  if (id === "bluetooth") return <Bluetooth className={className} />;
  return <Cloud className={className} />;
}

export default function SendPage() {
  const router = useRouter();
  const [guestDevice] = useState(generateEphemeralName);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [method, setMethod] = useState<TransferMethod>(getDefaultMethod());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Session state
  const [guestSessionId, setGuestSessionId] = useState<string | null>(null);
  const [guestSecret, setGuestSecret] = useState<string | null>(null);
  const [guestCode, setGuestCode] = useState<string | null>(null);
  const [cloudShareUrl, setCloudShareUrl] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [sendState, setSendState] = useState<SendState>("select-file");
  const [transferProgress, setTransferProgress] = useState<TransferProgress | null>(null);
  const [connectionState, setConnectionState] = useState("");
  const [countdown, setCountdown] = useState(900); // 15 min in seconds

  const pollRef = useRef<PollSignaling | null>(null);
  const engineRef = useRef<WebRTCEngine | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const methodInfo = getMethodInfo(method);
  const isCloud = method === "cloud";
  const isDirect = method === "direct";

  // Countdown timer
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

  const formatCountdown = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const handleFilePick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 50 * 1024 * 1024) { setError("File too large. Max: 50 MB."); return; }
      setSelectedFile(file);
      setError(null);
    }
  }, []);

  // ── CREATE GUEST SESSION ──
  const createGuestSession = useCallback(async () => {
    if (!selectedFile) return;
    setSending(true);
    setError(null);
    setSendState("creating");
    try {
      const res = await fetch("/api/guest/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sender_name: guestDevice,
          file_name: selectedFile.name,
          file_size: selectedFile.size,
          mime_type: selectedFile.type,
        }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      const data = await res.json();
      setGuestSessionId(data.session_id);
      setGuestSecret(data.transfer_secret);
      setGuestCode(data.transfer_code);

      // ── DIRECT TRANSFER ──
      if (isDirect) {
        setSendState("waiting");

        const poll = new PollSignaling();
        pollRef.current = poll;
        poll.onStateChange((s) => {
          if (s === "connecting") setConnectionState("Establishing signal...");
        });

        poll.onSignal(async (msg) => {
          if (msg.type === "receiver-joined") {
            setSendState("receiver-joined");
            setConnectionState("Receiver found! Connecting...");
            const engine = new WebRTCEngine();
            engineRef.current = engine;
            engine.onProgress((p) => setTransferProgress(p));
            engine.onStateChange((s) => {
              if (s === "transferring") { setSendState("transferring"); setConnectionState(""); }
              if (s === "verifying") setSendState("verifying");
              if (s === "completed") {
                setSendState("completed");
                poll.updateSessionStatus("completed");
                poll.stop();
              }
              if (s === "error") {
                setSendState("failed");
                setError("Connection lost during transfer.");
              }
            });

            const dc = await engine.createConnection(data.session_id, (m) => poll.send(m));
            await new Promise<void>((resolve) => {
              if (dc.readyState === "open") resolve();
              else dc.onopen = () => resolve();
            });
            await engine.sendFile(selectedFile);
            poll.stop();
          }
        });

        poll.start(data.session_id, data.transfer_secret, "sender");
      }

      // ── CLOUD TRANSFER ──
      if (isCloud) {
        setSendState("cloud-uploading");
        setConnectionState("Uploading to cloud...");
        try {
          const formData = new FormData();
          formData.append("file", selectedFile);

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
  }, [selectedFile, guestDevice, isDirect, isCloud]);

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
    setSelectedFile(null); setSendState("select-file"); setTransferProgress(null);
    setError(null); setConnectionState(""); setCloudShareUrl(null);
    pollRef.current?.stop();
    engineRef.current?.cleanup();
  };

  // ── METHOD + FILE SELECTION ──
  if (!selectedFile) {
    return (
      <div className="space-y-6 py-4">
        <button onClick={() => router.push("/")} className="text-sm text-text-muted hover:text-text-primary transition flex items-center gap-1">
          <ArrowLeft className="size-4" /> Back
        </button>

        <div className="text-center space-y-2">
          <h1 className="text-display text-text-primary">Send a file</h1>
          <p className="text-sm text-text-muted">You are: <span className="font-bold text-text-primary">{guestDevice}</span></p>
        </div>

        {/* Transfer method selection */}
        <div className="space-y-3">
          <p className="text-label text-text-muted text-center">Transfer method</p>
          <div className="flex justify-center gap-2 flex-wrap">
            {TRANSFER_METHODS.map((m) => {
              const selected = method === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => { if (m.supported) setMethod(m.id); }}
                  className={`rounded-full px-4 py-2.5 text-sm font-semibold transition flex items-center gap-2 ${
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

        {/* File picker */}
        <div
          onClick={() => fileRef.current?.click()}
          className="rounded-2xl p-8 sm:p-12 bg-bg-surface-muted cursor-pointer text-center transition hover:bg-bg-surface-muted/80"
        >
          <input ref={fileRef} type="file" className="hidden" onChange={handleFilePick} />
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-accent/10">
            <Upload className="size-6 text-accent" />
          </div>
          <p className="text-xl font-bold text-text-primary">Select a file</p>
          <p className="mt-2 text-sm text-text-muted">Click to browse &mdash; up to 50 MB</p>
        </div>

        {error && <p className="text-sm text-error text-center">{error}</p>}
      </div>
    );
  }

  // ── FILE SELECTED, NOT YET CREATED ──
  if (!guestCode) {
    return (
      <div className="space-y-6 py-4">
        <button onClick={resetSend} className="text-sm text-text-muted hover:text-text-primary transition flex items-center gap-1">
          <ArrowLeft className="size-4" /> Back
        </button>

        <div className="text-center space-y-2">
          <h1 className="text-display text-text-primary">Send a file</h1>
          <p className="text-sm text-text-muted">You are: <span className="font-bold text-text-primary">{guestDevice}</span></p>
          <div className="flex items-center justify-center gap-1.5 text-xs text-text-muted">
            <MethodIcon id={method} className="size-3" />
            {methodInfo.label}
            <span className="italic ml-1">&mdash; {methodInfo.helperText}</span>
          </div>
        </div>

        {/* Selected file preview */}
        <div className="rounded-2xl p-8 bg-bg-surface-muted text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-accent/10">
            <ArrowUpFromLine className="size-6 text-accent" />
          </div>
          <p className="text-lg font-bold text-text-primary">{selectedFile.name}</p>
          <p className="text-sm text-text-muted mt-1">{formatBytes(selectedFile.size)}</p>
          <button onClick={() => setSelectedFile(null)} className="text-xs text-text-muted hover:text-text-primary mt-2 transition">
            Remove
          </button>
        </div>

        <Button variant="primary" size="lg" className="w-full min-h-[56px] text-base"
          disabled={sending} onClick={createGuestSession}>
          {sending ? <Loader2 className="size-5 animate-spin" /> : <QrCode className="size-5" />}
          {sending ? "Creating session..." : "Generate pair code"}
        </Button>

        {error && <p className="text-sm text-error text-center">{error}</p>}
      </div>
    );
  }

  // ── QR + CODE DISPLAY (Direct Transfer: waiting for receiver) ──
  const showQrAndCode = sendState === "waiting" || sendState === "receiver-joined";

  // Cloud transfer QR data (shown after upload)
  const qrData = cloudShareUrl
    ? cloudShareUrl
    : isDirect
      ? JSON.stringify({ type: "opensend-join", session_id: guestSessionId, code: guestCode })
      : `${window.location.origin}/t/${guestCode}`;

  return (
    <div className="space-y-8 py-4">
      <button onClick={resetSend} className="text-sm text-text-muted hover:text-text-primary transition flex items-center gap-1">
        <ArrowLeft className="size-4" /> Back
      </button>

      {/* ── STATUS HEADERS ── */}

      {/* Direct: Waiting for receiver */}
      {showQrAndCode && (
        <div className="text-center space-y-2">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-accent/10">
            <QrCode className="size-8 text-accent" />
          </div>
          <h1 className="text-display text-text-primary">Share this code</h1>
          <p className="text-sm text-text-muted">Ask the receiver to scan the QR or enter the code</p>
        </div>
      )}

      {/* Cloud: Uploading */}
      {sendState === "cloud-uploading" && (
        <div className="text-center space-y-4">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-accent/10">
            <Cloud className="size-8 text-accent" />
          </div>
          <h1 className="text-display text-text-primary">Uploading to cloud...</h1>
          <p className="text-sm text-text-muted">{selectedFile?.name}</p>
          <Loader2 className="mx-auto size-6 text-accent animate-spin" />
        </div>
      )}

      {/* Cloud: Ready */}
      {sendState === "cloud-ready" && cloudShareUrl && (
        <div className="text-center space-y-2">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-accent/10">
            <Check className="size-8 text-accent" />
          </div>
          <h1 className="text-display text-text-primary">Upload complete!</h1>
          <p className="text-sm text-text-muted">Share this link or QR code with the receiver</p>
        </div>
      )}

      {/* Active transfer progress states */}
      {(sendState === "receiver-joined" || sendState === "connecting" || sendState === "transferring" || sendState === "verifying") && (
        <div className="text-center space-y-2">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-accent/10">
            <Loader2 className="size-8 text-accent animate-spin" />
          </div>
          <h1 className="text-display text-text-primary">{STATE_LABELS[sendState]}</h1>
          {connectionState && <p className="text-sm text-text-muted">{connectionState}</p>}
        </div>
      )}

      {/* Completed */}
      {sendState === "completed" && (
        <div className="text-center space-y-2">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-accent/10">
            <Check className="size-8 text-accent" />
          </div>
          <h1 className="text-display text-text-primary">Transfer complete!</h1>
          <p className="text-sm text-text-muted">{selectedFile?.name} sent successfully</p>
        </div>
      )}

      {/* Failed */}
      {sendState === "failed" && (
        <div className="text-center space-y-2">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-error/10">
            <Loader2 className="size-8 text-error" />
          </div>
          <h1 className="text-display text-text-primary">Transfer failed</h1>
          {error && <p className="text-sm text-error">{error}</p>}
        </div>
      )}

      {/* ── QR + CODE SECTION ── */}

      {/* Direct: Large QR + pair code */}
      {showQrAndCode && (
        <>
          <div className="flex justify-center">
            <div className="bg-white p-4 rounded-2xl shadow-lg">
              <QRDisplay data={qrData} size={280} />
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
              {sendState === "receiver-joined" ? "Receiver connected!" : "Waiting for receiver..."}
            </p>
          </div>

          <Button variant="secondary" size="lg" className="w-full" onClick={resetSend}>
            Cancel
          </Button>
        </>
      )}

      {/* Cloud-ready: Show download link + QR */}
      {sendState === "cloud-ready" && cloudShareUrl && (
        <>
          <div className="flex justify-center">
            <div className="bg-white p-4 rounded-2xl shadow-lg">
              <QRDisplay data={qrData} size={280} />
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

      {/* ── TRANSFER PROGRESS (Direct) ── */}
      {(sendState === "transferring" || sendState === "verifying") && transferProgress && (
        <div className="rounded-2xl p-6 bg-bg-surface-muted space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-text-muted">{formatBytes(transferProgress.bytesTransferred)}</span>
            <span className="text-text-primary font-bold">{transferProgress.percent}%</span>
          </div>
          <div className="h-3 rounded-full bg-bg-base overflow-hidden">
            <div
              className="h-full rounded-full bg-accent transition-all duration-200"
              style={{ width: `${Math.min(transferProgress.percent, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-text-muted">
            <span>{formatBytes(transferProgress.speedBps)}/s</span>
            <span>{transferProgress.chunkIndex} / {transferProgress.totalChunks} chunks</span>
          </div>
        </div>
      )}

      {/* ── COMPLETED ACTION ── */}
      {sendState === "completed" && isDirect && (
        <Button variant="primary" size="lg" className="w-full" onClick={resetSend}>
          Send another file
        </Button>
      )}

      {/* ── FAILED RETRY ── */}
      {sendState === "failed" && (
        <Button variant="primary" size="lg" className="w-full" onClick={resetSend}>
          Try again
        </Button>
      )}
    </div>
  );
}
