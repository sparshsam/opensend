/**
 * Supabase Realtime Signaling v0.2.1
 *
 * Uses Supabase Realtime broadcast channels for WebRTC signaling.
 * No custom WebSocket server needed — Realtime handles the pub/sub.
 *
 * Channel naming convention: opensend-signal-{sessionId}
 * Messages are broadcast as JSON with type, payload, and device info.
 */

import { createClient } from "@/lib/supabase/client";
import { type SignalMessage } from "./webrtc-engine";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type SignalHandler = (msg: SignalMessage) => void;

export class SignalingService {
  private channel: RealtimeChannel | null = null;
  private sessionId: string = "";
  private deviceId: string = "";

  /**
   * Join a signaling channel for a transfer session.
   * Both sender and receiver join the same channel.
   */
  join(sessionId: string, deviceId: string, onSignal: SignalHandler): void {
    this.leave(); // Clean up previous channel

    this.sessionId = sessionId;
    this.deviceId = deviceId;
    const supabase = createClient();

    this.channel = supabase.channel(`opensend-signal-${sessionId}`, {
      config: {
        broadcast: { self: true, ack: false },
        presence: { key: deviceId },
      },
    });

    // Listen for broadcast messages
    this.channel.on(
      "broadcast",
      { event: "signal" },
      ({ payload }: { payload: SignalMessage }) => {
        // Don't echo our own messages
        if (payload.senderDeviceId !== this.deviceId) {
          onSignal(payload);
        }
      },
    );

    // Track presence (who's in the channel)
    this.channel.on("presence", { event: "sync" }, () => {
      const state = this.channel?.presenceState() ?? {};
      const deviceIds = Object.keys(state);
      this.onPresenceChange?.(deviceIds);
    });

    this.channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        // Track our presence
        this.channel?.track({
          device_id: this.deviceId,
          joined_at: new Date().toISOString(),
        });
        this._onReady?.();
      }
    });
  }

  /** Send a WebRTC signal (offer, answer, ICE candidate) */
  send(msg: SignalMessage) {
    if (!this.channel) return;
    // Set sender device ID
    msg.senderDeviceId = this.deviceId;
    this.channel.send({
      type: "broadcast",
      event: "signal",
      payload: msg,
    });
  }

  /** Leave the signaling channel */
  leave() {
    if (this.channel) {
      this.channel.unsubscribe();
      this.channel = null;
    }
    this.sessionId = "";
  }

  get isJoined(): boolean {
    return this.channel !== null;
  }

  get currentSessionId(): string {
    return this.sessionId;
  }

  // Callbacks
  _onReady: (() => void) | null = null;
  onReady(fn: () => void) { this._onReady = fn; }

  onPresenceChange: ((deviceIds: string[]) => void) | null = null;
}

/**
 * Device heartbeat — announces this device is online.
 * Creates a lightweight realtime presence channel.
 */
export class DeviceHeartbeat {
  private channel: RealtimeChannel | null = null;
  private deviceId: string = "";
  private interval: ReturnType<typeof setInterval> | null = null;

  start(deviceId: string) {
    this.deviceId = deviceId;
    const supabase = createClient();

    this.channel = supabase.channel("opensend-devices", {
      config: {
        presence: { key: deviceId },
      },
    });

    this.channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        this.channel?.track({
          device_id: deviceId,
          online_at: new Date().toISOString(),
        });
      }
    });

    // Heartbeat every 30 seconds
    this.interval = setInterval(() => {
      this.channel?.track({
        device_id: deviceId,
        online_at: new Date().toISOString(),
      });
    }, 30000);
  }

  getOnlineDevices(): Promise<string[]> {
    return new Promise((resolve) => {
      if (!this.channel) { resolve([]); return; }
      const state = this.channel.presenceState();
      resolve(Object.keys(state));
    });
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
    this.channel?.unsubscribe();
    this.channel = null;
  }
}

/**
 * Get online device IDs from the presence channel.
 */
export async function getOnlineDevices(): Promise<string[]> {
  const supabase = createClient();
  const channel = supabase.channel("opensend-devices");
  return new Promise((resolve) => {
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        const state = channel.presenceState();
        const ids = Object.keys(state);
        channel.unsubscribe();
        resolve(ids);
      }
    });
  });
}
