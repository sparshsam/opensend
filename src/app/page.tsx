"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { Upload, Download, Send, Monitor, Smartphone, Loader2, ArrowUpFromLine, ArrowDownToLine, User, QrCode, KeyRound, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth-provider";
import { useDevice } from "@/components/device-provider";
import { useTransfer } from "@/components/transfer-provider";
import { TransferMonitor } from "@/components/transfer-monitor";
import { getGuestDevice } from "@/lib/guest-device";
import { generateEphemeralName } from "@/lib/ephemeral-names";
import { formatBytes } from "@/lib/utils";
import { PollSignaling } from "@/lib/webrtc/poll-signaling";
import { WebRTCEngine } from "@/lib/webrtc/webrtc-engine";

type PageView = "landing" | "send" | "receive" | "enter-code";

export default function HomePage() {
  const { user, signIn } = useAuth();
  const { devices } = useDevice();
  const { activeTransfers, startSend, cancelTransfer, incomingRequests, acceptTransfer, declineTransfer, startHeartbeat } = useTransfer();

  const [guestDevice] = useState(getGuestDevice);
  const [view, setView] = useState<PageView>("landing");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ephemeralName] = useState(generateEphemeralName);
  const fileRef = useRef<HTMLInputElement>(null);
  const [guestSessionId, setGuestSessionId] = useState<string | null>(null);
  const [guestSecret, setGuestSecret] = useState<string | null>(null);
  const [guestCode, setGuestCode] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [enteredCode, setEnteredCode] = useState("");
  const [joining, setJoining] = useState(false);
  const pollRef = useRef<PollSignaling | null>(null);
  const engineRef = useRef<WebRTCEngine | null>(null);
  const [connectionState, setConnectionState] = useState("");

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
    try {
      const res = await fetch(`/api/guest/sessions?code=${enteredCode.toUpperCase()}`);
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      const data = await res.json();

      // Generate receiver name and join
      const receiverName = generateEphemeralName();
      const joinRes = await fetch("/api/guest/sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: data.session_id,
          secret: data.transfer_code, // Temp: will use the code as secret for now
          receiver_name: receiverName,
          status: "paired",
        }),
      });

      if (!joinRes.ok) { const e = await joinRes.json(); throw new Error(e.error); }
      setView("receive");
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

  // Landing view
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

        {/* Enter Code button */}
        <div className="text-center">
          <button onClick={() => setView("enter-code")}
            className="inline-flex items-center gap-2 rounded-full px-6 py-3 bg-bg-surface-muted/50 text-text-secondary hover:text-text-primary transition"
          >
            <KeyRound className="size-4" />
            Enter pair code
          </button>
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
                <p className="font-bold text-text-primary">Incoming from {req.peerDevice}</p>
                <div className="flex gap-3">
                  <Button variant="primary" className="flex-1" onClick={() => acceptTransfer(req.sessionId)}>Accept</Button>
                  <Button variant="secondary" className="flex-1" onClick={() => declineTransfer(req.sessionId)}>Decline</Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Info bar + sign in */}
        <div className="border-t border-b border-border-default py-4">
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-label text-text-muted">
            <span>No account needed</span>
            <span className="text-text-muted/30 hidden sm:inline">&middot;</span>
            <span>Device to device</span>
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

  // ── ENTER CODE VIEW ──
  if (view === "enter-code") {
    return (
      <div className="space-y-8 py-10 max-w-sm mx-auto">
        <button onClick={() => setView("landing")} className="text-sm text-text-muted hover:text-text-primary transition">&larr; Back</button>
        <div className="text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-accent/10">
            <KeyRound className="size-6 text-accent" />
          </div>
          <h1 className="text-display text-text-primary">Enter pair code</h1>
          <p className="mt-2 text-sm text-text-muted">Ask the sender for their code</p>
        </div>
        <input
          value={enteredCode}
          onChange={(e) => setEnteredCode(e.target.value.toUpperCase())}
          placeholder="A7K9P2"
          maxLength={6}
          className="w-full text-center text-2xl font-bold tracking-[0.3em] rounded-full px-6 py-4 bg-bg-surface-muted text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <Button variant="primary" size="lg" className="w-full" disabled={enteredCode.length < 4 || joining} onClick={joinGuestSession}>
          {joining ? <Loader2 className="size-5 animate-spin" /> : null}
          {joining ? "Joining..." : "Join"}
        </Button>
        {error && <p className="text-sm text-error text-center">{error}</p>}
      </div>
    );
  }

  // ── SEND VIEW ──
  if (view === "send") {
    const showShare = guestCode && guestSessionId;

    return (
      <div className="space-y-6">
        <button onClick={() => { setView("landing"); setGuestCode(null); setGuestSessionId(null); setSelectedFile(null); }}
          className="text-sm text-text-muted hover:text-text-primary transition">&larr; Back</button>

        {!showShare ? (
          <>
            <div className="text-center space-y-2">
              <h1 className="text-display text-text-primary">Send a file</h1>
              <p className="text-sm text-text-muted">You are: <span className="font-bold text-text-primary">{ephemeralName}</span></p>
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
                  <button onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }} className="text-xs text-text-muted hover:text-text-primary mt-2 transition">Remove</button>
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
              <Button variant="primary" size="lg" className="w-full min-h-[56px] text-base" disabled={sending} onClick={createGuestSession}>
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
            <p className="text-sm text-text-muted">Tell the receiver to enter this code</p>

            {/* Pair code display */}
            <div className="rounded-2xl p-8 bg-bg-surface-muted space-y-6">
              <p className="text-5xl font-black text-text-primary tracking-[0.25em] select-all">{guestCode}</p>

              {/* QR placeholder */}
              <div className="mx-auto w-48 h-48 rounded-2xl bg-bg-base flex items-center justify-center">
                <div className="text-center space-y-2">
                  <QrCode className="mx-auto size-10 text-text-muted" />
                  <p className="text-xs text-text-muted">QR ready</p>
                  <p className="text-xs text-text-muted font-mono">{guestCode}</p>
                </div>
              </div>

              <Button variant="primary" size="lg" className="w-full" onClick={copyCode}>
                {copiedCode ? <Check className="size-5" /> : <Copy className="size-5" />}
                {copiedCode ? "Copied!" : "Copy code"}
              </Button>
            </div>

            <p className="text-xs text-text-muted">
              Session expires in 15 minutes &middot; File: {selectedFile?.name}
            </p>

            <Button variant="secondary" onClick={() => { setGuestCode(null); setGuestSessionId(null); setGuestSecret(null); setSelectedFile(null); }}>
              Send another file
            </Button>
          </div>
        )}
      </div>
    );
  }

  // ── RECEIVE VIEW ──
  return (
    <div className="space-y-8 py-10 text-center max-w-sm mx-auto">
      <button onClick={() => setView("landing")} className="text-sm text-text-muted hover:text-text-primary transition">&larr; Back</button>

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
          <span>Ask the sender for their code</span>
        </div>
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      {activeTransfers.length > 0 && (
        <div className="space-y-3">
          {activeTransfers.map((t) => (
            <TransferMonitor key={t.sessionId} {...t} onCancel={() => cancelTransfer(t.sessionId)} compact />
          ))}
        </div>
      )}
    </div>
  );
}
