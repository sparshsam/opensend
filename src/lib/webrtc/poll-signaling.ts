/**
 * HTTP Polling Signaling v0.2.4
 *
 * Replaces Supabase Realtime for guest transfers.
 * Both parties poll a shared HTTP endpoint to exchange
 * WebRTC signaling messages (offers, answers, ICE candidates).
 *
 * No WebSocket, no Supabase SDK, no auth required.
 */

import type { SignalMessage } from "./webrtc-engine";

export type PollSignalHandler = (msg: SignalMessage) => void;

const POLL_INTERVAL = 500; // ms between polls

export class PollSignaling {
  private sessionId: string = "";
  private secret: string = "";
  private senderType: "sender" | "receiver" = "sender";
  private lastPollTime: string = "";
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private _onSignal: PollSignalHandler | null = null;
  private _onStateChange: ((state: string) => void) | null = null;
  private _active: boolean = false;

  onSignal(fn: PollSignalHandler) { this._onSignal = fn; }
  onStateChange(fn: (s: string) => void) { this._onStateChange = fn; }

  /** Start polling for a session */
  start(sessionId: string, secret: string, type: "sender" | "receiver") {
    this.stop();
    this.sessionId = sessionId;
    this.secret = secret;
    this.senderType = type;
    this._active = true;
    this.lastPollTime = new Date(0).toISOString();
    this._onStateChange?.("connecting");
    this.poll();
  }

  /** Send a signaling message */
  async send(msg: SignalMessage) {
    if (!this._active) return;

    try {
      await fetch("/api/guest/signal", {
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
    } catch {
      // Silently fail — will retry via polling
    }
  }

  /** Poll for new messages */
  private async poll() {
    if (!this._active) return;

    try {
      const params = new URLSearchParams({ session_id: this.sessionId, since: this.lastPollTime });
      const res = await fetch(`/api/guest/signal?${params}`);

      if (res.ok) {
        const signals = await res.json();
        if (signals && signals.length > 0) {
          for (const sig of signals) {
            this.lastPollTime = sig.created_at;
            // Don't echo our own messages
            if (sig.sender_type !== this.senderType) {
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
      }
    } catch {
      // Network error — will retry
    }

    // Schedule next poll
    if (this._active) {
      this.pollTimer = setTimeout(() => this.poll(), POLL_INTERVAL);
    }
  }

  /** Update session status */
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
    } catch {}
    return null;
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
}
