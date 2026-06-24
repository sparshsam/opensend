"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import {
  Upload, Download, Send, Monitor, Smartphone, Loader2,
  ArrowUpFromLine, ArrowDownToLine, User, QrCode, KeyRound,
  Copy, Check, Wifi, Bluetooth, Cloud, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth-provider";
import { useTransfer } from "@/components/transfer-provider";
import { TransferMonitor } from "@/components/transfer-monitor";
import { getGuestDevice } from "@/lib/guest-device";
import { generateEphemeralName, generatePairCode } from "@/lib/ephemeral-names";
import { formatBytes } from "@/lib/utils";
import { PollSignaling } from "@/lib/webrtc/poll-signaling";
import { WebRTCEngine, type TransferProgress, type TransferMetadata } from "@/lib/webrtc/webrtc-engine";
import { TRANSFER_METHODS, getDefaultMethod, type TransferMethod } from "@/lib/transfer-methods";

type PageView = "landing" | "send" | "receive" | "enter-code" | "qr-scan";

export default function HomePage() {
  const { user, signIn } = useAuth();
  const { activeTransfers, incomingRequests, acceptTransfer, declineTransfer, cancelTransfer } = useTransfer();

  const [guestDevice] = useState(getGuestDevice);
  const [view, setView] = useState<PageView>("landing");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [method, setMethod] = useState<TransferMethod>(getDefaultMethod());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ephemeralName] = useState(generateEphemeralName);
  const fileRef = useRef<HTMLInputElement>(null);

  // Guest session state
  const [guestSessionId, setGuestSessionId] = useState<string | null>(null);
  const [guestSecret, setGuestSecret] = useState<string | null>(null);
  const [guestCode, setGuestCode] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [enteredCode, setEnteredCode] = useState("");
  const [joining, setJoining] = useState(false);
  const pollRef = useRef<PollSignaling | null>(null);
  const engineRef = useRef<WebRTCEngine | null>(null);
  const [connectionState, setConnectionState] = useState("");
  const [transferProgress, setTransferProgress] = useState<TransferProgress | null>(null);
  const [transferState, setTransferState] = useState<string>("");
  const [countdown, setCountdown] = useState(900); // 15 min in seconds
  const [receiverJoined, setReceiverJoined] = useState(false);
  const [guestTransferDone, setGuestTransferDone] = useState(false);

  // Countdown timer for guest session
  useEffect(() => {
    if (!guestSessionId || guestTransferDone) return;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [guestSessionId, guestTransferDone]);

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
    setConnectionState("Creating session...");
    try {
      const res = await fetch("/api/guest/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sender_name: ephemeralName,
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

      // Start polling for receiver
      const poll = new PollSignaling();
      pollRef.current = poll;
      poll.onStateChange((s) => setConnectionState(s));

      // When receiver joins, start WebRTC
      poll.onSignal(async (msg) => {
        if (msg.type === "receiver-joined") {
          setReceiverJoined(true);
          setConnectionState("Receiver found! Connecting...");
          // Start WebRTC as sender
          const engine = new WebRTCEngine();
          engineRef.current = engine;
          engine.onProgress((p) => setTransferProgress(p));
          engine.onStateChange((s) => {
            setTransferState(s);
            if (s === "completed") {
              setGuestTransferDone(true);
              poll.updateSessionStatus("completed");
              poll.stop();
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

      // Start polling
      poll.start(data.session_id, data.transfer_secret, "sender");

    } catch (err: any) {
      setError(err.message || "Failed to create session");
    } finally {
      setSending(false);
    }
  }, [selectedFile, ephemeralName]);

  // ── JOIN GUEST SESSION ──
  const joinGuestSession = useCallback(async () => {
    if (!enteredCode || enteredCode.length < 4) return;
    setJoining(true);
    setError(null);
    setConnectionState("Looking up session...");
    try {
      const res = await fetch(`/api/guest/sessions?code=${enteredCode.toUpperCase()}`);
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      const data = await res.json();

      const receiverName = generateEphemeralName();
      setConnectionState("Joining session...");

      // Join session
      const joinRes = await fetch("/api/guest/sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: data.session_id,
          secret: data.transfer_code,
          receiver_name: receiverName,
          status: "paired",
        }),
      });
      if (!joinRes.ok) { const e = await joinRes.json(); throw new Error(e.error); }

      setGuestSessionId(data.session_id);

      // Start polling as receiver
      const poll = new PollSignaling();
      pollRef.current = poll;
      poll.onStateChange((s) => setConnectionState(s));

      const engine = new WebRTCEngine();
      engineRef.current = engine;
      engine.onProgress((p) => setTransferProgress(p));
      engine.onStateChange((s) => {
        setTransferState(s);
        if (s === "completed") {
          setGuestTransferDone(true);
          poll.updateSessionStatus("completed");
          poll.stop();
        }
      });
      engine.onMetadata((m: TransferMetadata) => {
        setConnectionState(`Receiving: ${m.fileName}`);
      });

      // Tell sender we joined
      poll.start(data.session_id, data.transfer_code, "receiver");

      // Poll for the offer
      let offerFound = false;
      const waitForOffer = async () => {
        while (!offerFound) {
          const signals = await fetch(`/api/guest/signal?session_id=${data.session_id}`).then(r => r.json());
          for (const sig of signals || []) {
            if (sig.message_type === "offer" && sig.sender_type === "sender") {
              offerFound = true;
              const dc = await engine.acceptConnection(
                data.session_id,
                sig.payload,
                (m) => poll.send(m),
              );
              await new Promise<void>((resolve) => {
                if (dc.readyState === "open") resolve();
                else dc.onopen = () => resolve();
              });
              break;
            }
          }
          if (!offerFound) await new Promise(r => setTimeout(r, 500));
        }
      };
      waitForOffer();

    } catch (err: any) {
      setError(err.message || "Failed to join session");
    } finally {
      setJoining(false);
    }
  }, [enteredCode]);

  const copyCode = async () => {
    if (!guestCode) return;
    await navigator.clipboard.writeText(guestCode);
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
    setSelectedFile(null); setConnectionState(""); setReceiverJoined(false);
    setGuestTransferDone(false); setTransferProgress(null); setTransferState("");
    pollRef.current?.stop();
    engineRef.current?.cleanup();
    setView("landing");
  };

  const handleMethodChange = (m: TransferMethod) => {
    setMethod(m);
    setError(null);
    if (m === "cloud") {
      // Cloud method uses existing Supabase upload flow — redirect
      window.location.href = window.location.href; // Simple page reload to show original flow
    }
  };

  // ── LANDING ──
  if (view === "landing") {
    return (
      <div className="space-y-10 py-10">
        <div className="text-center space-y-4">
          <h1 className="text-hero text-text-primary">OpenSend</h1>
          <p className="text-lg text-text-secondary max-w-md mx-auto">
            Send files directly between devices. No account needed.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 max-w-md mx-auto">
          <button onClick={() => { setView("send"); setError(null); }}
            className="rounded-2xl p-8 bg-bg-surface-muted text-center hover:bg-bg-surface-muted/80 transition cursor-pointer space-y-3"
          >
            <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-accent/10">
              <ArrowUpFromLine className="size-8 text-accent" />
            </div>
            <p className="text-xl font-bold text-text-primary">Send</p>
            <p className="text-sm text-text-muted">Choose a file and share a QR code or pair code</p>
          </button>
          <button onClick={() => { setView("receive"); setError(null); }}
            className="rounded-2xl p-8 bg-bg-surface-muted text-center hover:bg-bg-surface-muted/80 transition cursor-pointer space-y-3"
          >
            <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-accent/10">
              <ArrowDownToLine className="size-8 text-accent" />
            </div>
            <p className="text-xl font-bold text-text-primary">Receive</p>
            <p className="text-sm text-text-muted">Scan a QR code or enter a pair code</p>
          </button>
        </div>

        <div className="text-center">
          <button onClick={() => setView("enter-code")}
            className="inline-flex items-center gap-2 rounded-full px-6 py-3 bg-bg-surface-muted/50 text-text-secondary hover:text-text-primary transition"
          >
            <KeyRound className="size-4" /> Enter pair code
          </button>
        </div>

        {/* Transfer method selector */}
        <div className="border-t border-b border-border-default py-4">
          <p className="text-label text-text-muted text-center mb-3">Transfer method</p>
          <div className="flex justify-center gap-3 flex-wrap">
            {TRANSFER_METHODS.map((m) => (
              <button key={m.id}
                onClick={() => m.supported ? handleMethodChange(m.id) : null}
                className={`rounded-full px-5 py-2.5 text-sm font-semibold transition flex items-center gap-2 ${
                  method === m.id
                    ? "bg-accent text-white"
                    : m.supported
                      ? "bg-bg-surface-muted/30 text-text-secondary hover:text-text-primary"
                      : "bg-bg-surface-muted/10 text-text-muted cursor-not-allowed"
                }`}
                title={!m.supported ? m.supportMessage : ""}
              >
                {m.id === "direct" && <Wifi className="size-4" />}
                {m.id === "bluetooth" && <Bluetooth className="size-4" />}
                {m.id === "cloud" && <Cloud className="size-4" />}
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Active transfers */}
        {activeTransfers.length > 0 && (
          <div className="space-y-3">
            <p className="text-label text-text-muted text-center">Active transfers</p>
            {activeTransfers.map((t) => (
              <TransferMonitor key={t.sessionId} {...t} onCancel={() => cancelTransfer(t.sessionId)} compact />
            ))}
          </div>
        )}

        {/* Incoming requests */}
        {incomingRequests.length > 0 && (
          <div className="space-y-3 max-w-sm mx-auto">
            {incomingRequests.map((req) => (
              <div key={req.sessionId} className="rounded-2xl p-6 bg-bg-surface-muted space-y-4">
                <div className="flex items-center gap-4">
                  <div className="flex size-12 items-center justify-center rounded-full bg-accent/10">
                    <ArrowDownToLine className="size-6 text-accent" />
                  </div>
                  <div>
                    <p className="font-bold text-text-primary">{req.peerDevice}</p>
                    <p className="text-sm text-text-muted">{req.fileName || "Incoming transfer"}</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button variant="primary" className="flex-1" onClick={() => acceptTransfer(req.sessionId)}>Accept</Button>
                  <Button variant="secondary" className="flex-1" onClick={() => declineTransfer(req.sessionId)}>Decline</Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-b border-border-default py-4">
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-label text-text-muted">
            <span>No account needed</span>
            <span className="text-text-muted/30 hidden sm:inline">&middot;</span>
            <span>Wi-Fi / Direct</span>
            <span className="text-text-muted/30 hidden sm:inline">&middot;</span>
            <span>Free &amp; ad-free</span>
            <span className="text-text-muted/30 hidden sm:inline">&middot;</span>
            <span>Open-source</span>
          </div>
        </div>
        {!user && (
          <div className="text-center">
            <button onClick={signIn} className="text-sm text-text-muted hover:text-text-primary transition">
              <User className="size-4 inline mr-1" /> Sign in for trusted devices &amp; sync
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── ENTER CODE ──
  if (view === "enter-code") {
    return (
      <div className="space-y-8 py-10 max-w-sm mx-auto">
        <button onClick={() => setView("landing")} className="text-sm text-text-muted hover:text-text-primary transition">&larr; Back</button>
        <div className="text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-accent/10">
            <KeyRound className="size-6 text-accent" />
          </div>
          <h1 className="text-display text-text-primary">Enter pair code</h1>
          <p className="mt-2 text-sm text-text-muted">Ask the sender for their 6-character code</p>
        </div>
        <input
          value={enteredCode}
          onChange={(e) => setEnteredCode(e.target.value.toUpperCase())}
          placeholder="A7K9P2"
          maxLength={6}
          className="w-full text-center text-3xl sm:text-4xl font-black tracking-[0.3em] rounded-full px-6 py-5 bg-bg-surface-muted text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <Button variant="primary" size="lg" className="w-full min-h-[56px] text-base"
          disabled={enteredCode.length < 4 || joining} onClick={joinGuestSession}>
          {joining ? <Loader2 className="size-5 animate-spin" /> : <KeyRound className="size-5" />}
          {joining ? "Joining..." : "Join"}
        </Button>
        {connectionState && <p className="text-sm text-text-muted text-center">{connectionState}</p>}
        {error && <p className="text-sm text-error text-center">{error}</p>}
      </div>
    );
  }

  // ── SEND ──
  if (view === "send") {
    const showShare = guestCode && guestSessionId;

    return (
      <div className="space-y-6">
        <button onClick={resetSend} className="text-sm text-text-muted hover:text-text-primary transition">&larr; Back</button>

        {!showShare ? (
          <>
            <div className="text-center space-y-2">
              <h1 className="text-display text-text-primary">Send a file</h1>
              <p className="text-sm text-text-muted">You are: <span className="font-bold text-text-primary">{ephemeralName}</span></p>
              <p className="text-xs text-text-muted flex items-center justify-center gap-1">
                <Wifi className="size-3" /> {TRANSFER_METHODS.find(m => m.id === method)?.label}
              </p>
            </div>

            {/* Method selector */}
            <div className="flex justify-center gap-2 flex-wrap">
              {TRANSFER_METHODS.filter(m => m.id !== "cloud").map((m) => (
                <button key={m.id}
                  onClick={() => m.supported ? handleMethodChange(m.id) : null}
                  className={`rounded-full px-4 py-2 text-xs font-semibold transition flex items-center gap-1.5 ${
                    method === m.id
                      ? "bg-accent text-white"
                      : m.supported
                        ? "bg-bg-surface-muted/30 text-text-secondary hover:text-text-primary"
                        : "bg-bg-surface-muted/10 text-text-muted cursor-not-allowed"
                  }`}
                >
                  {m.id === "direct" && <Wifi className="size-3" />}
                  {m.id === "bluetooth" && <Bluetooth className="size-3" />}
                  {m.label}
                </button>
              ))}
            </div>

            <div onClick={() => fileRef.current?.click()}
              className="rounded-2xl p-8 sm:p-12 bg-bg-surface-muted cursor-pointer text-center transition hover:bg-bg-surface-muted/80"
            >
              <input ref={fileRef} type="file" className="hidden" onChange={handleFilePick} />
              {selectedFile ? (
                <div>
                  <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-accent/10">
                    <ArrowUpFromLine className="size-6 text-accent" />
                  </div>
                  <p className="text-lg font-bold text-text-primary">{selectedFile.name}</p>
                  <p className="text-sm text-text-muted mt-1">{formatBytes(selectedFile.size)}</p>
                  <button onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                    className="text-xs text-text-muted hover:text-text-primary mt-2 transition">Remove</button>
                </div>
              ) : (
                <div>
                  <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-accent/10">
                    <Upload className="size-6 text-accent" />
                  </div>
                  <p className="text-xl font-bold text-text-primary">Select a file</p>
                  <p className="mt-2 text-sm text-text-muted">Click to browse &mdash; up to 50 MB</p>
                </div>
              )}
            </div>

            {selectedFile && (
              <Button variant="primary" size="lg" className="w-full min-h-[56px] text-base"
                disabled={sending} onClick={createGuestSession}>
                {sending ? <Loader2 className="size-5 animate-spin" /> : <QrCode className="size-5" />}
                {sending ? "Creating session..." : "Generate pair code"}
              </Button>
            )}
            {error && <p className="text-sm text-error text-center">{error}</p>}
          </>
        ) : (
          <div className="space-y-8 text-center">
            <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-accent/10">
              <Check className="size-8 text-accent" />
            </div>
            <h1 className="text-display text-text-primary">Share this code</h1>
            <p className="text-sm text-text-muted">
              Tell the receiver to enter this code
              {!receiverJoined && <span className="block mt-1 text-xs">Session expires in {formatCountdown(countdown)}</span>}
            </p>

            <div className="rounded-2xl p-8 bg-bg-surface-muted space-y-6">
              {/* Large pair code */}
              <p className="text-5xl sm:text-6xl font-black text-text-primary tracking-[0.25em] select-all">
                {guestCode}
              </p>

              {/* QR placeholder */}
              <div className="mx-auto w-48 h-48 rounded-2xl bg-bg-base flex items-center justify-center">
                <div className="text-center space-y-2">
                  <QrCode className="mx-auto size-10 text-text-muted" />
                  <p className="text-xs text-text-muted font-mono">{guestCode}</p>
                  <p className="text-[10px] text-text-muted/50">Scan to connect</p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <Button variant="primary" className="flex-1" onClick={copyCode}>
                  {copiedCode ? <Check className="size-5" /> : <Copy className="size-5" />}
                  {copiedCode ? "Copied!" : "Copy code"}
                </Button>
                <Button variant="secondary" className="flex-1" onClick={shareCode}>
                  Share
                </Button>
              </div>
            </div>

            {/* Connection state */}
            {(connectionState || receiverJoined || transferState) && (
              <div className="border-t border-b border-border-default py-4 space-y-2">
                {connectionState && <p className="text-sm text-text-muted">{connectionState}</p>}
                {receiverJoined && !transferState && (
                  <p className="text-sm text-accent font-semibold">Receiver connected! Transferring...</p>
                )}
                {transferState === "transferring" && transferProgress && (
                  <div className="space-y-1">
                    <div className="h-1.5 rounded-full bg-bg-base overflow-hidden">
                      <div className="h-full rounded-full bg-accent transition-all duration-200"
                        style={{ width: `${Math.min(transferProgress.percent, 100)}%` }} />
                    </div>
                    <p className="text-xs text-text-muted">{transferProgress.percent}%</p>
                  </div>
                )}
                {transferState === "completed" && (
                  <p className="text-sm text-accent font-bold">Transfer complete!</p>
                )}
                {transferState === "verifying" && (
                  <p className="text-sm text-text-muted">Verifying checksum...</p>
                )}
              </div>
            )}

            {guestTransferDone ? (
              <Button variant="primary" onClick={resetSend}>Send another file</Button>
            ) : (
              <Button variant="secondary" onClick={resetSend}>Cancel</Button>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── RECEIVE ──
  return (
    <div className="space-y-8 py-10 text-center max-w-sm mx-auto">
      <button onClick={() => { setView("landing"); resetSend(); }}
        className="text-sm text-text-muted hover:text-text-primary transition">&larr; Back</button>

      <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-accent/10">
        <ArrowDownToLine className="size-10 text-accent" />
      </div>

      <h1 className="text-display text-text-primary">Receive a file</h1>
      <p className="text-sm text-text-muted">
        You are: <span className="font-bold text-text-primary">{ephemeralName}</span>
      </p>

      <div className="space-y-4">
        <Button variant="primary" size="lg" className="w-full" onClick={() => setView("enter-code")}>
          <KeyRound className="size-5" /> Enter pair code
        </Button>
      </div>

      <div className="border-t border-b border-border-default py-4">
        <div className="flex items-center justify-center gap-4 text-xs text-label text-text-muted">
          <span>Ask the sender for their 6-character code</span>
        </div>
      </div>

      {/* Transfer progress for receiver */}
      {(connectionState || transferState) && (
        <div className="rounded-2xl p-6 bg-bg-surface-muted space-y-3 text-center">
          {connectionState && <p className="text-sm text-text-muted">{connectionState}</p>}
          {transferState === "transferring" && transferProgress && (
            <div className="space-y-1">
              <p className="text-sm text-accent font-semibold">Receiving...</p>
              <div className="h-1.5 rounded-full bg-bg-base overflow-hidden">
                <div className="h-full rounded-full bg-accent transition-all duration-200"
                  style={{ width: `${Math.min(transferProgress.percent, 100)}%` }} />
              </div>
              <p className="text-xs text-text-muted">{transferProgress.percent}%</p>
            </div>
          )}
          {transferState === "completed" && (
            <p className="text-sm text-accent font-bold">Download complete!</p>
          )}
        </div>
      )}

      {error && <p className="text-sm text-error">{error}</p>}
    </div>
  );
}
