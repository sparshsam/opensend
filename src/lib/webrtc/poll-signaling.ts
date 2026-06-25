/**
 * OpenSend v0.4.0 — HTTP Polling Signaling with Cancel Propagation + Reconnect
 *
 * Replaces Supabase Realtime for guest transfers.
 * Both parties poll a shared HTTP endpoint to exchange
 * WebRTC signaling messages (offers, answers, ICE candidates).
 *
 * v0.4.0:
 *  - Cancel signal propagation (sends cancel on stop)
 *  - Session reconnection support (store last session ID)
 *  - Duplicate transfer prevention
 *  - Exponential backoff between polls on failure
 *  - Better logging
 */

import type { SignalMessage } from "./webrtc-engine";

export type PollSignalHandler = (msg: SignalMessage) => void;

const POLL_INTERVAL = 500; // ms between polls
const MAX_CONSECUTIVE_FAILURES = 10;
const CANCEL_TIMEOUT_MS = 3000;

export class PollSignaling {
  private sessionId: string = "";
  private secret: string = "";
  private senderType: "sender" | "receiver" = "sender";
  private lastPollTime: string = "";
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private _onSignal: PollSignalHandler | null = null;
  private _onStateChange: ((state: string) => void) | null = null;
  private _onExpired: (() => void) | null = null;
  private _onCancelled: (() => void) | null = null;
  private _active: boolean = false;
  private consecutiveFailures: number = 0;
  private currentBackoff: number = POLL_INTERVAL;

  onSignal(fn: PollSignalHandler) { this._onSignal = fn; }
  onStateChange(fn: (s: string) => void) { this._onStateChange = fn; }
  onExpired(fn: () => void) { this._onExpired = fn; }
  onCancelled(fn: () => void) { this._onCancelled = fn; }

  /** Start polling for a session */
  start(sessionId: string, secret: string, type: "sender" | "receiver") {
    this.stop();
    this.sessionId = sessionId;
    this.secret = secret;
    this.senderType = type;
    this._active = true;
    this.consecutiveFailures = 0;
    this.currentBackoff = POLL_INTERVAL;
    this.lastPollTime = new Date(0).toISOString();
    this._onStateChange?.("connecting");
    this.poll();
  }

  /** Send a signaling message */
  async send(msg: SignalMessage) {
    if (!this._active) return;

    console.log("[PollSignaling] Sending signal:", msg.type);
    try {
      const res = await fetch("/api/guest/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: this.sessionId,
          secret: this.secret,
          sender_type: this.senderType,
          message_type: msg.type,
          payload: msg.payload,
        }),
      });

      if (res.status === 410) {
        console.warn("[PollSignaling] Session closed (410), stopping");
        this._onExpired?.();
        this.stop();
        return;
      }

      if (res.status === 409) {
        // Duplicate session — already connected
        console.warn("[PollSignaling] Duplicate session (409)");
        this._onCancelled?.();
        this.stop();
        return;
      }

      if (!res.ok) {
        console.warn("[PollSignaling] Send failed:", res.status);
      }
    } catch (err) {
      console.warn("[PollSignaling] Send error:", err);
    }
  }

  /** Send a cancel signal and stop */
  async sendCancel() {
    if (!this._active) return;
    console.log("[PollSignaling] Sending cancel...");
    try {
      await fetch("/api/guest/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: this.sessionId,
          secret: this.secret,
          sender_type: this.senderType,
          message_type: "cancel",
          payload: {},
        }),
      });
    } catch {}
    this._onCancelled?.();
    this.stop();
  }

  /** Send session status update */
  async updateSessionStatus(status: string, extra?: Record<string, unknown>) {
    try {
      const body: Record<string, unknown> = {
        session_id: this.sessionId,
        secret: this.secret,
        status,
      };
      if (extra) Object.assign(body, extra);
      await fetch("/api/guest/sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      // Silently fail
    }
  }

  /** Get current session info */
  async getSessionInfo(): Promise<any> {
    try {
      const res = await fetch(`/api/guest/sessions?code=${this.sessionId}&secret=${this.secret}`);
      if (res.ok) return await res.json();
      if (res.status === 410) {
        this._onExpired?.();
        this.stop();
      }
    } catch {}
    return null;
  }

  /** Poll for new messages */
  private async poll() {
    if (!this._active) return;

    try {
      const params = new URLSearchParams({
        session_id: this.sessionId,
        since: this.lastPollTime,
      });
      const res = await fetch(`/api/guest/signal?${params}`);

      if (res.status === 410) {
        // Session expired or cancelled
        console.warn("[PollSignaling] Session expired (410), stopping");
        this._onExpired?.();
        this.stop();
        return;
      }

      if (res.ok) {
        this.consecutiveFailures = 0;
        this.currentBackoff = POLL_INTERVAL;
        const signals = await res.json();
        if (signals && signals.length > 0) {
          for (const sig of signals) {
            this.lastPollTime = sig.created_at;
            if (sig.sender_type !== this.senderType) {
              // Check for cancel type in signal response
              if (sig.message_type === "cancel") {
                console.warn("[PollSignaling] Cancel received, stopping");
                this._onCancelled?.();
                this.stop();
                return;
              }
              this._onSignal?.({
                type: sig.message_type,
                payload: sig.payload,
                sessionId: this.sessionId,
                senderDeviceId: "",
                receiverDeviceId: "",
              });
            }
          }
        }
      } else {
        this.consecutiveFailures++;
        this.currentBackoff = Math.min(this.currentBackoff * 1.5, 5000);
        if (this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          console.warn("[PollSignaling] Too many consecutive failures, stopping");
          this._onStateChange?.("failed");
          this.stop();
          return;
        }
      }
    } catch {
      this.consecutiveFailures++;
      this.currentBackoff = Math.min(this.currentBackoff * 1.5, 5000);
      if (this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.warn("[PollSignaling] Network unreachable after max failures, stopping");
        this._onStateChange?.("failed");
        this.stop();
      }
    }

    // Schedule next poll with backoff
    if (this._active) {
      this.pollTimer = setTimeout(() => this.poll(), this.currentBackoff);
    }
  }

  /** Stop polling */
  stop() {
    this._active = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  get isActive(): boolean { return this._active; }
  get currentSessionId(): string { return this.sessionId; }
  get currentSecret(): string { return this.secret; }
}
