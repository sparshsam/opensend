/**
 * WebRTC Engine v0.2.1
 *
 * Core RTCPeerConnection + DataChannel management for direct device-to-device
 * file transfer. Handles connection lifecycle, ICE negotiation, data channels,
 * chunked file transfer with progress tracking, and checksum verification.
 *
 * Architecture:
 *   Sender → RTCPeerConnection → Receiver
 *   Signaling via Supabase Realtime (offers/answers/ICE candidates)
 *   Data sent in chunks over Uint8Array DataChannels
 */

export type ConnectionState = "new" | "connecting" | "connected" | "disconnected" | "failed" | "closed";
export type TransferState = "idle" | "negotiating" | "transferring" | "verifying" | "completed" | "cancelled" | "error";

export interface TransferProgress {
  bytesTransferred: number;
  totalBytes: number;
  percent: number;
  speedBps: number;
  estimatedRemainingMs: number | null;
  chunkIndex: number;
  totalChunks: number;
}

export interface TransferMetadata {
  fileName: string;
  fileSize: number;
  mimeType: string;
  checksum: string;
  checksumAlgorithm: "sha256";
}

export type SignalMessage = {
  type: "offer" | "answer" | "ice-candidate" | "transfer-request" | "transfer-accept" | "transfer-decline" | "transfer-cancel" | "transfer-metadata" | "transfer-chunk-ack" | "transfer-complete" | "checksum-verify" | "checksum-ok" | "checksum-fail" | "receiver-joined" | "receiver-info";
  payload: any;
  sessionId: string;
  senderDeviceId: string;
  receiverDeviceId: string;
};

const CHUNK_SIZE = 16384; // 16KB per chunk (standard WebRTC message size)

function getIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];

  // TURN support via env vars (optional)
  if (typeof process !== "undefined" && process.env) {
    const turnUrls = process.env.NEXT_PUBLIC_TURN_URLS;
    const turnUser = process.env.NEXT_PUBLIC_TURN_USERNAME;
    const turnCred = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;

    if (turnUrls) {
      servers.push({
        urls: turnUrls.split(","),
        username: turnUser || undefined,
        credential: turnCred || undefined,
      });
    }
  }

  return servers;
}

export class WebRTCEngine {
  private pc: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private pendingCandidates: RTCIceCandidate[] = [];
  private fileChunks: Uint8Array[] = [];
  private currentFile: File | null = null;
  private metadata: TransferMetadata | null = null;
  private startTime: number = 0;
  private lastBytes: number = 0;
  private lastTime: number = 0;
  private _onProgress: ((p: TransferProgress) => void) | null = null;
  private _onStateChange: ((s: TransferState) => void) | null = null;
  private _onComplete: ((success: boolean) => void) | null = null;
  private _onChunk: ((data: Uint8Array) => void) | null = null;
  private _onMetadata: ((m: TransferMetadata) => void) | null = null;
  private _debug: boolean = false;

  state: TransferState = "idle";
  progress: TransferProgress = {
    bytesTransferred: 0, totalBytes: 0, percent: 0,
    speedBps: 0, estimatedRemainingMs: null,
    chunkIndex: 0, totalChunks: 0,
  };

  onProgress(fn: (p: TransferProgress) => void) { this._onProgress = fn; }
  onStateChange(fn: (s: TransferState) => void) { this._onStateChange = fn; }
  onComplete(fn: (success: boolean) => void) { this._onComplete = fn; }
  onChunk(fn: (data: Uint8Array) => void) { this._onChunk = fn; }
  onMetadata(fn: (m: TransferMetadata) => void) { this._onMetadata = fn; }

  private setState(s: TransferState) {
    this.state = s;
    this._onStateChange?.(s);
  }

  private log(...args: any[]) {
    if (this._debug) console.log("[WebRTC]", ...args);
  }

  // ── SENDER: Initiate connection ──────────────────────────────
  async createConnection(sessionId: string, onSignal: (msg: SignalMessage) => void): Promise<RTCDataChannel> {
    this.log("Creating sender connection");
    this.pc = new RTCPeerConnection({ iceServers: getIceServers() });
    this.setState("negotiating");

    this.dataChannel = this.pc.createDataChannel("filedata", {
      ordered: true,
    });
    this.setupDataChannel(this.dataChannel);

    // ICE candidate handler → signal out
    this.pc.onicecandidate = (e) => {
      if (e.candidate) {
        onSignal({
          type: "ice-candidate",
          payload: e.candidate.toJSON(),
          sessionId,
          senderDeviceId: "",
          receiverDeviceId: "",
        });
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      this.log("ICE state:", this.pc?.iceConnectionState);
      if (this.pc?.iceConnectionState === "connected") {
        this.setState("transferring");
      }
    };

    this.pc.onconnectionstatechange = () => {
      this.log("Connection state:", this.pc?.connectionState);
      if (this.pc?.connectionState === "connected") {
        this.setState("transferring");
      } else if (this.pc?.connectionState === "failed" || this.pc?.connectionState === "disconnected") {
        this.setState("error");
      }
    };

    // Create and return offer
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    onSignal({
      type: "offer",
      payload: offer,
      sessionId,
      senderDeviceId: "",
      receiverDeviceId: "",
    });

    return this.dataChannel;
  }

  // ── RECEIVER: Accept connection ─────────────────────────────
  async acceptConnection(
    sessionId: string,
    offer: RTCSessionDescriptionInit,
    onSignal: (msg: SignalMessage) => void,
  ): Promise<RTCDataChannel> {
    this.log("Creating receiver connection");
    this.pc = new RTCPeerConnection({ iceServers: getIceServers() });
    this.setState("negotiating");

    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));

    // Incoming data channel
    this.pc.ondatachannel = (e) => {
      this.dataChannel = e.channel;
      this.setupDataChannel(e.channel);
    };

    this.pc.onicecandidate = (e) => {
      if (e.candidate) {
        onSignal({
          type: "ice-candidate",
          payload: e.candidate.toJSON(),
          sessionId,
          senderDeviceId: "",
          receiverDeviceId: "",
        });
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      this.log("ICE state:", this.pc?.iceConnectionState);
    };

    this.pc.onconnectionstatechange = () => {
      this.log("Connection state:", this.pc?.connectionState);
      if (this.pc?.connectionState === "connected") {
        this.setState("transferring");
      } else if (this.pc?.connectionState === "failed" || this.pc?.connectionState === "disconnected") {
        this.setState("error");
      }
    };

    // Create answer
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    onSignal({
      type: "answer",
      payload: answer,
      sessionId,
      senderDeviceId: "",
      receiverDeviceId: "",
    });

    // Wait for data channel
    await new Promise<void>((resolve) => {
      const check = () => {
        if (this.dataChannel) resolve();
        else setTimeout(check, 100);
      };
      check();
    });

    return this.dataChannel!;
  }

  // ── Handle incoming signal (offer/answer/ICE) ──────────────
  async handleSignal(msg: SignalMessage) {
    if (!this.pc) return;

    switch (msg.type) {
      case "offer":
        await this.pc.setRemoteDescription(new RTCSessionDescription(msg.payload));
        // Flush pending ICE candidates
        for (const c of this.pendingCandidates) {
          await this.pc.addIceCandidate(c).catch(() => {});
        }
        this.pendingCandidates = [];
        break;

      case "answer":
        await this.pc.setRemoteDescription(new RTCSessionDescription(msg.payload));
        // Flush pending ICE candidates
        for (const c of this.pendingCandidates) {
          await this.pc.addIceCandidate(c).catch(() => {});
        }
        this.pendingCandidates = [];
        break;

      case "ice-candidate":
        const candidate = new RTCIceCandidate(msg.payload);
        if (this.pc.remoteDescription) {
          await this.pc.addIceCandidate(candidate).catch(() => {});
        } else {
          this.pendingCandidates.push(candidate);
        }
        break;
    }
  }

  // ── FILE TRANSFER (Sender) ──────────────────────────────────
  async sendFile(file: File): Promise<string> {
    if (!this.dataChannel || this.dataChannel.readyState !== "open") {
      throw new Error("Data channel not open");
    }

    this.currentFile = file;
    this.startTime = Date.now();
    this.lastBytes = 0;
    this.lastTime = this.startTime;

    // Read file into chunks
    const buffer = await file.arrayBuffer();
    const data = new Uint8Array(buffer);
    const totalChunks = Math.ceil(data.length / CHUNK_SIZE);
    this.fileChunks = [];

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, data.length);
      this.fileChunks.push(data.slice(start, end));
    }

    this.progress = {
      bytesTransferred: 0,
      totalBytes: data.length,
      percent: 0,
      speedBps: 0,
      estimatedRemainingMs: null,
      chunkIndex: 0,
      totalChunks,
    };

    // Compute SHA-256 checksum
    const checksum = await computeSHA256(data);
    this.metadata = {
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || "application/octet-stream",
      checksum,
      checksumAlgorithm: "sha256",
    };

    // Send metadata first
    this.sendJSON({ type: "metadata", metadata: this.metadata });

    // Wait for metadata ack
    await new Promise<void>((resolve) => {
      const handler = (e: MessageEvent) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "metadata-ack") resolve();
        } catch {}
      };
      this.dataChannel!.addEventListener("message", handler, { once: true });
      // Also resolve after timeout
      setTimeout(resolve, 1000);
    });

    // Send chunks with acknowledgement
    this.setState("transferring");
    const RETRY_MAX = 3;
    const ACK_TIMEOUT = 500; // ms

    for (let i = 0; i < this.fileChunks.length; i++) {
      if (this.dataChannel?.readyState !== "open") {
        throw new Error("Connection lost during transfer");
      }

      const chunk = this.fileChunks[i];
      let retries = 0;
      let acked = false;

      while (!acked && retries < RETRY_MAX) {
        try {
          this.dataChannel.send(chunk.buffer as ArrayBuffer);
        } catch (sendErr) {
          retries++;
          if (retries >= RETRY_MAX) {
            throw new Error("Failed to send chunk after retries");
          }
          await new Promise((r) => setTimeout(r, 100 * retries));
          continue;
        }

        // Wait for ack
        acked = await new Promise<boolean>((resolve) => {
          const timer = setTimeout(() => resolve(false), ACK_TIMEOUT);
          const handler = (e: MessageEvent) => {
            if (typeof e.data === "string") {
              try {
                const m = JSON.parse(e.data);
                if (m.type === "chunk-ack" && m.chunk_index === i) {
                  clearTimeout(timer);
                  resolve(true);
                }
              } catch {}
            }
          };
          this.dataChannel!.addEventListener("message", handler, { once: true });
        });

        if (!acked) retries++;
      }

      this.progress.chunkIndex = i + 1;
      this.progress.bytesTransferred += chunk.length;
      this.progress.percent = Math.round((this.progress.bytesTransferred / this.progress.totalBytes) * 100);

      // Speed calculation
      const now = Date.now();
      const elapsed = now - this.lastTime;
      if (elapsed >= 200) {
        const bytesSinceLast = this.progress.bytesTransferred - this.lastBytes;
        this.progress.speedBps = Math.round(bytesSinceLast / (elapsed / 1000));
        const remaining = this.progress.totalBytes - this.progress.bytesTransferred;
        this.progress.estimatedRemainingMs = remaining > 0 && this.progress.speedBps > 0
          ? Math.round((remaining / this.progress.speedBps) * 1000)
          : null;
        this.lastBytes = this.progress.bytesTransferred;
        this.lastTime = now;
      }

      this._onProgress?.(this.progress);

      // Small delay between chunks to let the UI breathe
      if (i % 64 === 0) await new Promise((r) => setTimeout(r, 0));
    }

    // Send checksum for verification
    this.sendJSON({ type: "checksum", checksum: this.metadata.checksum });
    this.setState("verifying");

    return checksum;
  }

  // ── FILE RECEIVE (Receiver) ─────────────────────────────────
  private receivedChunks: Uint8Array[] = [];
  private receivedMetadata: TransferMetadata | null = null;
  private receivedChecksum: string | null = null;
  private receivedBytes: number = 0;

  private setupDataChannel(dc: RTCDataChannel) {
    dc.binaryType = "arraybuffer";

    dc.onopen = () => {
      this.log("Data channel open");
    };

    dc.onclose = () => {
      this.log("Data channel closed");
    };

    dc.onmessage = async (e: MessageEvent) => {
      if (typeof e.data === "string") {
        // JSON message
        try {
          const msg = JSON.parse(e.data);
          await this.handleDataChannelMessage(msg);
        } catch {
          this.log("Failed to parse message:", e.data);
        }
      } else {
        // Binary chunk
        const chunk = new Uint8Array(e.data);
        this.receivedChunks.push(chunk);
        this.receivedBytes += chunk.length;

        // Send chunk acknowledgement
        this.sendJSON({ type: "chunk-ack", chunk_index: this.receivedChunks.length - 1 });

        this.progress.bytesTransferred = this.receivedBytes;
        this.progress.percent = this.receivedMetadata
          ? Math.round((this.receivedBytes / this.receivedMetadata.fileSize) * 100)
          : 0;

        const now = Date.now();
        const elapsed = now - this.lastTime;
        if (elapsed >= 200) {
          const bytesSinceLast = this.receivedBytes - this.lastBytes;
          this.progress.speedBps = Math.round(bytesSinceLast / (elapsed / 1000));
          if (this.receivedMetadata) {
            const remaining = this.receivedMetadata.fileSize - this.receivedBytes;
            this.progress.estimatedRemainingMs = remaining > 0 && this.progress.speedBps > 0
              ? Math.round((remaining / this.progress.speedBps) * 1000)
              : null;
          }
          this.lastBytes = this.receivedBytes;
          this.lastTime = now;
        }

        this._onProgress?.(this.progress);
      }
    };
  }

  private async handleDataChannelMessage(msg: any) {
    switch (msg.type) {
      case "metadata":
        this.receivedMetadata = msg.metadata as TransferMetadata;
        this.receivedChunks = [];
        this.receivedBytes = 0;
        this.progress.totalBytes = msg.metadata.fileSize;
        this._onMetadata?.(msg.metadata);
        // Send ack
        this.sendJSON({ type: "metadata-ack" });
        break;

      case "checksum":
        this.receivedChecksum = msg.checksum;
        this.setState("verifying");
        // Reconstruct file
        await this.verifyAndComplete();
        break;

      case "cancel":
        this.setState("cancelled");
        this.cleanup();
        break;
    }
  }

  private async verifyAndComplete() {
    if (!this.receivedMetadata || !this.receivedChecksum) return;

    const totalLength = this.receivedChunks.reduce((s, c) => s + c.length, 0);
    const fullData = new Uint8Array(new ArrayBuffer(totalLength));
    let offset = 0;
    for (const chunk of this.receivedChunks) {
      fullData.set(chunk, offset);
      offset += chunk.length;
    }

    const computedChecksum = await computeSHA256(fullData);
    const match = computedChecksum === this.receivedChecksum;

    if (match) {
      this.setState("completed");
      this._onComplete?.(true);

      // Trigger download
      const blob = new Blob([fullData], { type: this.receivedMetadata.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = this.receivedMetadata.fileName;
      a.click();
      URL.revokeObjectURL(url);

      this.sendJSON({ type: "checksum-ok", checksum: computedChecksum });
    } else {
      this.setState("error");
      this._onComplete?.(false);
      this.sendJSON({ type: "checksum-fail", expected: this.receivedChecksum, got: computedChecksum });
    }

    this.receivedChunks = [];
  }

  private sendJSON(obj: any) {
    if (this.dataChannel?.readyState === "open") {
      this.dataChannel.send(JSON.stringify(obj));
    }
  }

  // ── CANCEL ──────────────────────────────────────────────────
  cancel() {
    this.sendJSON({ type: "cancel" });
    this.setState("cancelled");
    this.cleanup();
  }

  // ── CLEANUP ─────────────────────────────────────────────────
  cleanup() {
    this.dataChannel?.close();
    this.pc?.close();
    this.pc = null;
    this.dataChannel = null;
    this.fileChunks = [];
    this.currentFile = null;
    this.receivedChunks = [];
    this.receivedMetadata = null;
  }
}

// ── SHA-256 helper ────────────────────────────────────────────
export async function computeSHA256(data: Uint8Array): Promise<string> {
  // @ts-ignore — type-safe at runtime; TS 5.8+ Uint8Array generic mismatch
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Format utilities ──────────────────────────────────────────
export function formatSpeed(bps: number): string {
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} MB/s`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(0)} KB/s`;
  return `${bps} B/s`;
}

export function formatETA(ms: number | null): string {
  if (!ms || ms <= 0) return "--";
  const sec = Math.ceil(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  return `${min}m ${sec % 60}s`;
}
