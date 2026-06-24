"use client";

import { useCallback, useState } from "react";
import {
  ArrowDownToLine, KeyRound, Loader2, Check,
  Smartphone, ArrowLeft, QrCode,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateEphemeralName } from "@/lib/ephemeral-names";
import { PollSignaling } from "@/lib/webrtc/poll-signaling";
import { WebRTCEngine, type TransferProgress, type TransferMetadata } from "@/lib/webrtc/webrtc-engine";
import { useRouter } from "next/navigation";

type ReceiveState =
  | "idle"
  | "looking-up"
  | "joining"
  | "connected"
  | "receiving"
  | "verifying"
  | "completed"
  | "failed";

export default function ReceivePage() {
  const router = useRouter();
  const [enteredCode, setEnteredCode] = useState("");
  const [receiveState, setReceiveState] = useState<ReceiveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState("");
  const [transferProgress, setTransferProgress] = useState<TransferProgress | null>(null);
  const [deviceName] = useState(generateEphemeralName);

  const pollRef = useCallback(() => new PollSignaling(), []);
  const engineRef = useCallback(() => new WebRTCEngine(), []);

  // ── JOIN BY CODE ──
  const joinByCode = useCallback(async () => {
    if (!enteredCode || enteredCode.length < 4) return;
    setError(null);
    setReceiveState("looking-up");
    setConnectionState("Looking up session...");

    try {
      // Look up the session by transfer code
      const res = await fetch(`/api/guest/sessions?code=${enteredCode.toUpperCase()}`);
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || "Session not found");
      }
      const data = await res.json();

      setConnectionState("Joining session...");
      setReceiveState("joining");

      const receiverName = generateEphemeralName();

      // Join with transfer_code (not secret) — server validates and allows pairing
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
        throw new Error(e.error || "Failed to join session");
      }

      setReceiveState("connected");
      setConnectionState("Receiver joined! Connecting...");

      // Start polling for WebRTC signals
      const poll = new PollSignaling();
      const engine = new WebRTCEngine();

      engine.onProgress((p) => setTransferProgress(p));
      engine.onStateChange((s) => {
        if (s === "transferring") setReceiveState("receiving");
        if (s === "verifying") setReceiveState("verifying");
        if (s === "completed") {
          setReceiveState("completed");
          poll.updateSessionStatus("completed");
          poll.stop();
        }
        if (s === "error") {
          setReceiveState("failed");
          setError("Transfer failed — connection lost.");
        }
      });
      engine.onMetadata((m: TransferMetadata) => {
        setConnectionState(`Receiving: ${m.fileName}`);
      });

      // Tell sender we joined (send a signal)
      poll.start(data.session_id, data.transfer_code, "receiver");

      // Send receiver-joined signal
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

      // Poll for the WebRTC offer
      let offerFound = false;
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

    } catch (err: any) {
      setReceiveState("failed");
      setError(err.message || "Failed to join session");
    }
  }, [enteredCode]);

  const handleCodeChange = (value: string) => {
    setEnteredCode(value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
  };

  const reset = () => {
    setReceiveState("idle");
    setError(null);
    setConnectionState("");
    setTransferProgress(null);
    setEnteredCode("");
  };

  // ── COMPLETED ──
  if (receiveState === "completed") {
    return (
      <div className="space-y-8 text-center py-10">
        <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-accent/10">
          <Check className="size-10 text-accent" />
        </div>
        <h1 className="text-display text-text-primary">Download complete!</h1>
        <p className="text-sm text-text-muted">The file has been saved to your downloads.</p>
        <Button variant="primary" onClick={() => router.push("/")}>
          Back to home
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 py-10 max-w-md mx-auto">
      <button onClick={() => { reset(); router.push("/"); }}
        className="text-sm text-text-muted hover:text-text-primary transition flex items-center gap-1">
        <ArrowLeft className="size-4" /> Back
      </button>

      <div className="text-center space-y-4">
        <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-accent/10">
          <ArrowDownToLine className="size-10 text-accent" />
        </div>
        <h1 className="text-display text-text-primary">Receive a file</h1>
        <p className="text-sm text-text-muted">
          You are: <span className="font-bold text-text-primary">{deviceName}</span>
        </p>
      </div>

      {/* Idle state: show QR scan info + pair code entry */}
      {receiveState === "idle" && (
        <>
          {/* QR info */}
          <div className="rounded-2xl p-6 bg-bg-surface-muted text-center space-y-3">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent/10">
              <Smartphone className="size-6 text-accent" />
            </div>
            <h2 className="text-lg font-bold text-text-primary">Scan QR code</h2>
            <p className="text-sm text-text-muted">
              Use your phone camera to scan the sender&apos;s QR code, or enter the pair code below.
            </p>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border-default" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-bg-base px-3 text-text-muted">or</span>
            </div>
          </div>

          {/* Pair code entry */}
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
            disabled={enteredCode.length < 4} onClick={joinByCode}>
            <KeyRound className="size-5" /> Join
          </Button>
        </>
      )}

      {/* Joining state */}
      {(receiveState === "looking-up" || receiveState === "joining" || receiveState === "connected" || receiveState === "receiving" || receiveState === "verifying") && (
        <div className="rounded-2xl p-8 bg-bg-surface-muted space-y-4 text-center">
          <Loader2 className="mx-auto size-8 text-accent animate-spin" />
          <p className="text-lg font-bold text-text-primary">
            {receiveState === "looking-up" && "Looking up session..."}
            {receiveState === "joining" && "Joining session..."}
            {receiveState === "connected" && "Connected! Waiting for file..."}
            {receiveState === "receiving" && "Receiving..."}
            {receiveState === "verifying" && "Verifying checksum..."}
          </p>
          {connectionState && (
            <p className="text-sm text-text-muted">{connectionState}</p>
          )}

          {/* Progress bar */}
          {(receiveState === "receiving" || receiveState === "verifying") && transferProgress && (
            <div className="space-y-2">
              <div className="h-3 rounded-full bg-bg-base overflow-hidden">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-200"
                  style={{ width: `${Math.min(transferProgress.percent, 100)}%` }}
                />
              </div>
              <p className="text-sm text-text-muted">{transferProgress.percent}%</p>
            </div>
          )}
        </div>
      )}

      {/* Failed state */}
      {receiveState === "failed" && (
        <div className="rounded-2xl p-8 bg-bg-surface-muted text-center space-y-4">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-error/10">
            <Loader2 className="size-6 text-error" />
          </div>
          <p className="text-lg font-bold text-text-primary">Failed to join</p>
          {error && <p className="text-sm text-error">{error}</p>}
          <Button variant="primary" onClick={reset}>Try again</Button>
        </div>
      )}

      {error && receiveState === "idle" && (
        <p className="text-sm text-error text-center">{error}</p>
      )}
    </div>
  );
}
