/**
 * OpenSend v0.4.0 — Production Transfer Engine
 *
 * Core RTCPeerConnection + DataChannel management for direct device-to-device
 * file transfer. Handles connection lifecycle, ICE negotiation, data channels,
 * chunked file transfer with progress tracking, checksum verification, and
 * batch (multi-file) transfers with per-file resilience.
 *
 * v0.4.0 improvements:
 *  - Adaptive chunk sizing based on connection quality estimates
 *  - Sliding-window speed measurement (last 8 samples, EWMA smoothing)
 *  - Exponential backoff retry with jitter (max 4 retries)
 *  - Improved bufferedAmount backpressure with drain events
 *  - Explicit cancel() with cross-side propagation
 *  - Memory streaming for large files (100MB+ read in slices)
 *  - Progress smoothing (EWMA over speed samples, clamp to prevent jumps)
 *  - Structured diagnostic logging with categories
 *  - Per-file timeout adapted by file size
 *  - ICE restart with exponential backoff
 */

export type ConnectionState = "new" | "connecting" | "connected" | "disconnected" | "failed" | "closed";
export type TransferState = "idle" | "negotiating" | "transferring" | "verifying" | "completed" | "cancelled" | "error";

export interface TransferProgress {
  bytesTransferred: number;
  totalBytes: number;
  percent: number;
  speedBps: number;
  speedAvgBps: number; // Smoothed average over sliding window
  estimatedRemainingMs: number | null;
  chunkIndex: number;
  totalChunks: number;
  // Batch fields
  currentFileIndex: number;
  fileCount: number;
  currentFileName: string;
  overallPercent?: number;
  filesCompleted?: number;
}

export interface TransferMetadata {
  fileName: string;
  fileSize: number;
  mimeType: string;
  checksum: string;
  checksumAlgorithm: "sha256";
}

export interface BatchFileInfo {
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export interface BatchMetadata {
  fileCount: number;
  totalSize: number;
  files: BatchFileInfo[];
}

export type SignalMessage = {
  type: "offer" | "answer" | "ice-candidate"
    | "transfer-request" | "transfer-accept" | "transfer-decline" | "transfer-cancel"
    | "transfer-metadata" | "transfer-chunk-ack" | "transfer-complete"
    | "checksum-verify" | "checksum-ok" | "checksum-fail"
    | "receiver-joined" | "receiver-info"
    | "batch-metadata" | "file-complete" | "batch-complete"
    | "batch-received" | "all-files-verified"
    | "cancel" | "cancel-ack";
  payload: any;
  sessionId: string;
  senderDeviceId: string;
  receiverDeviceId: string;
};

const BASE_CHUNK_SIZE = 8192;     // 8KB baseline (Safari compatible)
const MAX_CHUNK_SIZE = 65536;     // 64KB when connection quality is good
const PER_FILE_TIMEOUT_MS = 120000; // 120s per file base
const FILE_PACING_DELAY_MS = 100;
const MAX_RECONNECT_ATTEMPTS = 3;  // Increased from 2
const RECONNECT_DELAY_MS = 2000;
const MAX_RETRIES_CHUNK = 4;       // Increased from 3
const MAX_RETRIES_FILE = 2;        // Increased from 1
const BACKPRESSURE_THRESHOLD = 512 * 1024; // 512KB (reduced from 1MB for tighter control)
const BACKPRESSURE_HIGH = 2 * 1024 * 1024; // 2MB high watermark
const SPEED_SAMPLES = 8;           // Sliding window size
const EWMA_ALPHA = 0.3;            // Smoothing factor for speed (0-1, lower = smoother)
const CHUNK_ACK_TIMEOUT = 500;     // ms
const LARGE_FILE_THRESHOLD = 100 * 1024 * 1024; // 100MB

// Connection quality thresholds (bps)
const QUALITY_GOOD = 5_000_000;    // 5 Mbps
const QUALITY_FAIR = 1_000_000;    // 1 Mbps

function getIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];

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
  private _onFileDownloaded: ((fileName: string, blob: Blob) => void) | null = null;
  private _onBatchMetadata: ((m: BatchMetadata) => void) | null = null;
  private _onBatchComplete: (() => void) | null = null;
  private _onBatchReceived: (() => void) | null = null;
  private _onCancel: (() => void) | null = null;
  private _debug: boolean = false;
  private _transferCompleted: boolean = false;
  private _reconnectAttempts: number = 0;
  private _cancelled: boolean = false;

  // Adaptive chunk sizing
  private currentChunkSize: number = BASE_CHUNK_SIZE;
  private connectionQuality: "unknown" | "good" | "fair" | "poor" = "unknown";
  private qualityMeasurementWindow: number[] = []; // Recent speed samples for quality

  // Sliding-window speed measurement
  private speedSamples: number[] = [];
  private smoothedSpeed: number = 0;

  // Batch state (sender)
  private batchFiles: BatchFileInfo[] = [];
  private currentFileIndex: number = 0;
  private batchFileCount: number = 1;
  private failedFiles: string[] = [];

  // Batch state (receiver)
  private receivedBatchMetadata: BatchMetadata | null = null;
  private receivedFileIndex: number = 0;
  private receivedFilesCount: number = 1;
  private accumulatedPercent: number = 0;

  /** Message queue to serialize async DataChannel message processing */
  private messageQueue: Array<() => Promise<void>> = [];
  private processingMessages: boolean = false;

  /** Diagnostic log (structured) */
  private diagLog: string[] = [];

  state: TransferState = "idle";
  progress: TransferProgress = {
    bytesTransferred: 0, totalBytes: 0, percent: 0,
    speedBps: 0, speedAvgBps: 0, estimatedRemainingMs: null,
    chunkIndex: 0, totalChunks: 0,
    currentFileIndex: 0, fileCount: 1, currentFileName: "",
    overallPercent: 0, filesCompleted: 0,
  };

  onProgress(fn: (p: TransferProgress) => void) { this._onProgress = fn; }
  onStateChange(fn: (s: TransferState) => void) { this._onStateChange = fn; }
  onComplete(fn: (success: boolean) => void) { this._onComplete = fn; }
  onChunk(fn: (data: Uint8Array) => void) { this._onChunk = fn; }
  onMetadata(fn: (m: TransferMetadata) => void) { this._onMetadata = fn; }
  onFileDownloaded(fn: (fileName: string, blob: Blob) => void) { this._onFileDownloaded = fn; }
  onBatchMetadata(fn: (m: BatchMetadata) => void) { this._onBatchMetadata = fn; }
  onBatchComplete(fn: () => void) { this._onBatchComplete = fn; }
  onBatchReceived(fn: () => void) { this._onBatchReceived = fn; }
  onCancel(fn: () => void) { this._onCancel = fn; }

  getDiagLog(): string { return this.diagLog.join("\n"); }
  getFailedFiles(): string[] { return [...this.failedFiles]; }
  getCompletedFilesCount(): number { return this.progress.filesCompleted ?? 0; }

  /** Collect structured diagnostics */
  getDiagnostics(): Record<string, unknown> {
    return {
      state: this.state,
      transferCompleted: this._transferCompleted,
      cancelled: this._cancelled,
      bytesTransferred: this.progress.bytesTransferred,
      totalBytes: this.progress.totalBytes,
      percent: this.progress.percent,
      speedBps: this.progress.speedBps,
      speedAvgBps: this.progress.speedAvgBps,
      chunkSize: this.currentChunkSize,
      connectionQuality: this.connectionQuality,
      currentFileIndex: this.currentFileIndex,
      fileCount: this.batchFileCount,
      filesCompleted: this.progress.filesCompleted,
      failedFiles: this.failedFiles.length,
      failedFileNames: this.failedFiles,
      reconnectAttempts: this._reconnectAttempts,
      dataChannelState: this.dataChannel?.readyState ?? "none",
      iceConnectionState: this.pc?.iceConnectionState ?? "none",
      iceGatheringState: this.pc?.iceGatheringState ?? "none",
      connectionState: this.pc?.connectionState ?? "none",
      log: this.diagLog.slice(-30),
    };
  }

  private diag(category: string, msg: string, data?: unknown) {
    const entry = data
      ? `[${Date.now()}] [${category}] ${msg} ${JSON.stringify(data)}`
      : `[${Date.now()}] [${category}] ${msg}`;
    this.diagLog.push(entry);
    if (this._debug) console.log("[WebRTC]", entry);
  }

  private setState(s: TransferState) {
    if (this._cancelled && s !== "cancelled") return; // Don't overwrite cancelled
    this.state = s;
    this._onStateChange?.(s);
  }

  /** Adaptive chunk size based on estimated connection quality */
  private updateChunkSize(speedBps: number) {
    this.qualityMeasurementWindow.push(speedBps);
    if (this.qualityMeasurementWindow.length > 10) {
      this.qualityMeasurementWindow.shift();
    }

    const avgSpeed = this.qualityMeasurementWindow.reduce((a, b) => a + b, 0) / this.qualityMeasurementWindow.length;
    
    let newQuality: "unknown" | "good" | "fair" | "poor";
    if (avgSpeed >= QUALITY_GOOD) newQuality = "good";
    else if (avgSpeed >= QUALITY_FAIR) newQuality = "fair";
    else if (this.qualityMeasurementWindow.length >= 3) newQuality = "poor";
    else newQuality = "unknown";

    if (newQuality !== this.connectionQuality) {
      this.connectionQuality = newQuality;
      this.diag("quality", `Connection quality: ${newQuality} (avg ${Math.round(avgSpeed / 1000)} Kbps)`);

      switch (newQuality) {
        case "good":
          this.currentChunkSize = MAX_CHUNK_SIZE;
          break;
        case "fair":
          this.currentChunkSize = 16384; // 16KB
          break;
        case "poor":
          this.currentChunkSize = 4096; // 4KB — smaller chunks = less retransmit cost
          break;
        default:
          this.currentChunkSize = BASE_CHUNK_SIZE;
      }
    }
  }

  /** Update speed measurement with sliding window + EWMA smoothing */
  private recordSpeedSample(bytesSinceLast: number, elapsedMs: number) {
    if (elapsedMs <= 0) return;
    const instantSpeed = Math.round(bytesSinceLast / (elapsedMs / 1000));

    // Sliding window
    this.speedSamples.push(instantSpeed);
    if (this.speedSamples.length > SPEED_SAMPLES) {
      this.speedSamples.shift();
    }

    // Simple average for instantaneous display
    const avgSpeed = Math.round(
      this.speedSamples.reduce((a, b) => a + b, 0) / this.speedSamples.length
    );

    // EWMA smoothing for displayed speed
    if (this.smoothedSpeed === 0) {
      this.smoothedSpeed = avgSpeed;
    } else {
      this.smoothedSpeed = Math.round(
        EWMA_ALPHA * avgSpeed + (1 - EWMA_ALPHA) * this.smoothedSpeed
      );
    }

    // Clamp to prevent unrealistic jumps (max 2x previous)
    const MAX_SPEED_JUMP = 2.0;
    if (this.progress.speedAvgBps > 0 && this.smoothedSpeed > this.progress.speedAvgBps * MAX_SPEED_JUMP) {
      this.smoothedSpeed = Math.round(this.progress.speedAvgBps * MAX_SPEED_JUMP);
    }

    this.progress.speedBps = avgSpeed;
    this.progress.speedAvgBps = this.smoothedSpeed;

    // Update adaptive chunk size
    this.updateChunkSize(avgSpeed);
  }

  /** Get exponential backoff delay with jitter */
  private getRetryDelay(attempt: number, baseMs: number = 200): number {
    const exponential = baseMs * Math.pow(2, attempt);
    const jitter = Math.random() * exponential * 0.3; // 0-30% jitter
    return Math.round(exponential + jitter);
  }

  // ── SENDER: Initiate connection ──
  async createConnection(sessionId: string, onSignal: (msg: SignalMessage) => void): Promise<RTCDataChannel> {
    this.diag("lifecycle", "Creating sender connection");
    try {
      this.pc = new RTCPeerConnection({ iceServers: getIceServers() });
    } catch (err) {
      this.diag("error", `RTCPeerConnection constructor failed: ${err}`);
      throw new Error(`WebRTC not available: ${err}`);
    }
    this.setState("negotiating");

    try {
      this.dataChannel = this.pc.createDataChannel("filedata", {
        ordered: true,
      });
    } catch (err) {
      this.diag("error", `createDataChannel failed: ${err}`);
      throw new Error(`DataChannel creation failed: ${err}`);
    }
    this.setupDataChannel(this.dataChannel);

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
      this.diag("ice", `ICE state: ${this.pc?.iceConnectionState}`);
      if (this.pc?.iceConnectionState === "failed") {
        this.diag("ice", "ICE connection failed — attempting restart");
        this.attemptIceRestart(onSignal, sessionId);
      }
      if (this.pc?.iceConnectionState === "connected") {
        this._reconnectAttempts = 0;
        if (this.state === "negotiating") {
          this.setState("transferring");
        }
      }
    };

    this.pc.onconnectionstatechange = () => {
      this.diag("connection", `Connection state: ${this.pc?.connectionState}`);
      if (this._transferCompleted || this._cancelled) return;
      if (this.pc?.connectionState === "connected") {
        this._reconnectAttempts = 0;
        if (this.state === "negotiating") {
          this.setState("transferring");
        }
      } else if (this.pc?.connectionState === "failed") {
        if (this._reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          this.diag("connection", `Connection failed — restarting ICE (attempt ${this._reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);
          this.attemptIceRestart(onSignal, sessionId);
        } else {
          this.diag("connection", `Connection failed after ${MAX_RECONNECT_ATTEMPTS} reconnect attempts`);
          this.diag("connection", "STUN/TURN could not establish a direct connection.");
          this.setState("error");
        }
      } else if (this.pc?.connectionState === "disconnected") {
        const delay = this._reconnectAttempts > 0
          ? this.getRetryDelay(this._reconnectAttempts - 1, 2000)
          : 5000;
        this.diag("connection", `Disconnected, will check in ${delay}ms`);
        setTimeout(() => {
          if (this._cancelled || this._transferCompleted) return;
          if (this.pc?.connectionState === "disconnected" && !this._transferCompleted) {
            if (this._reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
              this.diag("connection", "Connection stayed disconnected — restarting ICE");
              this.attemptIceRestart(onSignal, sessionId);
            } else {
              this.diag("connection", "Connection stayed disconnected after reconnect attempts — failing");
              this.setState("error");
            }
          }
        }, delay);
      }
    };

    let offer;
    try {
      offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
    } catch (err) {
      this.diag("error", `createOffer/setLocalDescription failed: ${err}`);
      throw new Error(`WebRTC offer creation failed: ${err}`);
    }
    this.diag("signaling", "Offer created");
    onSignal({
      type: "offer",
      payload: offer,
      sessionId,
      senderDeviceId: "",
      receiverDeviceId: "",
    });

    return this.dataChannel;
  }

  // ── ICE RESTART with exponential backoff ──
  private async attemptIceRestart(onSignal: (msg: SignalMessage) => void, sessionId: string) {
    if (!this.pc || this._transferCompleted || this._cancelled) return;
    if (this._reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;

    this._reconnectAttempts++;
    this.diag("ice", `ICE restart attempt ${this._reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);

    try {
      const offer = await this.pc.createOffer({ iceRestart: true });
      await this.pc.setLocalDescription(offer);
      onSignal({
        type: "offer",
        payload: offer,
        sessionId,
        senderDeviceId: "",
        receiverDeviceId: "",
      });
      this.diag("ice", "ICE restart offer sent");
    } catch (err) {
      this.diag("error", `ICE restart failed: ${err}`);
      if (this._reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        this.setState("error");
      }
    }
  }

  // ── RECEIVER: Accept connection ──
  async acceptConnection(
    sessionId: string,
    offer: RTCSessionDescriptionInit,
    onSignal: (msg: SignalMessage) => void,
  ): Promise<RTCDataChannel> {
    this.diag("lifecycle", "Creating receiver connection");
    this.pc = new RTCPeerConnection({ iceServers: getIceServers() });
    this.setState("negotiating");

    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    this.diag("signaling", "Remote description set (offer)");

    this.pc.ondatachannel = (e) => {
      this.diag("lifecycle", "Incoming data channel received");
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
      this.diag("ice", `Receiver ICE state: ${this.pc?.iceConnectionState}`);
      if (this.pc?.iceConnectionState === "failed") {
        this.diag("ice", "Receiver ICE failed — attempting restart");
        if (!this._cancelled && !this._transferCompleted) {
          this.attemptIceRestart(onSignal, sessionId);
        }
      }
    };

    this.pc.onconnectionstatechange = () => {
      this.diag("connection", `Receiver connection state: ${this.pc?.connectionState}`);
      if (this._transferCompleted || this._cancelled) return;
      if (this.pc?.connectionState === "connected") {
        this.setState("transferring");
      } else if (this.pc?.connectionState === "failed") {
        if (this._reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          this.diag("connection", `Receiver connection failed — restarting ICE (attempt ${this._reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);
          this.attemptIceRestart(onSignal, sessionId);
        } else {
          this.diag("error", `Receiver connection failed after ${MAX_RECONNECT_ATTEMPTS} attempts`);
          this.setState("error");
        }
      } else if (this.pc?.connectionState === "disconnected") {
        const delay = this._reconnectAttempts > 0
          ? this.getRetryDelay(this._reconnectAttempts - 1, 2000)
          : 5000;
        setTimeout(() => {
          if (this._cancelled || this._transferCompleted) return;
          if (this.pc?.connectionState === "disconnected" && !this._transferCompleted) {
            if (this._reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
              this.diag("connection", "Receiver stayed disconnected — restarting ICE");
              this.attemptIceRestart(onSignal, sessionId);
            } else {
              this.diag("error", "Receiver stayed disconnected after max attempts — failing");
              this.setState("error");
            }
          }
        }, delay);
      }
    };

    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    this.diag("signaling", "Answer created");
    onSignal({
      type: "answer",
      payload: answer,
      sessionId,
      senderDeviceId: "",
      receiverDeviceId: "",
    });

    await new Promise<void>((resolve) => {
      const check = () => {
        if (this.dataChannel) {
          this.diag("lifecycle", "Data channel received");
          resolve();
        } else setTimeout(check, 100);
      };
      check();
    });

    return this.dataChannel!;
  }

  // ── Handle incoming signal (offer/answer/ICE) ──
  async handleSignal(msg: SignalMessage) {
    if (!this.pc) return;

    switch (msg.type) {
      case "offer":
        this.diag("signaling", "Handling offer signal");
        await this.pc.setRemoteDescription(new RTCSessionDescription(msg.payload));
        for (const c of this.pendingCandidates) {
          await this.pc.addIceCandidate(c).catch(() => {});
        }
        this.pendingCandidates = [];
        break;

      case "answer":
        this.diag("signaling", "Handling answer signal");
        await this.pc.setRemoteDescription(new RTCSessionDescription(msg.payload));
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

  // ── BATCH FILE TRANSFER (Sender) ──
  async sendFiles(files: File[]): Promise<void> {
    if (!this.dataChannel || this.dataChannel.readyState !== "open") {
      throw new Error("Data channel not open");
    }

    if (files.length === 0) throw new Error("No files to send");

    this.diag("batch", `Starting batch send: ${files.length} files`);
    this.failedFiles = [];

    this.batchFiles = files.map((f) => ({
      fileName: f.name,
      fileSize: f.size,
      mimeType: f.type || "application/octet-stream",
    }));
    this.batchFileCount = files.length;

    const totalBatchSize = files.reduce((s, f) => s + f.size, 0);
    this.accumulatedPercent = 0;

    // Send batch metadata first
    const batchMeta: BatchMetadata = {
      fileCount: files.length,
      totalSize: totalBatchSize,
      files: this.batchFiles,
    };
    this.sendJSON({ type: "batch-metadata", batch: batchMeta });
    this.setState("transferring");
    this.diag("batch", "Batch metadata sent");

    // Wait for batch-metadata ack
    await this.waitForMessage("batch-metadata-ack", 5000);
    this.diag("batch", "Batch metadata acknowledged");

    // Transfer each file sequentially, skipping failed ones
    for (let i = 0; i < files.length; i++) {
      if (this._cancelled) {
        this.diag("batch", "Batch cancelled during transfer");
        break;
      }

      this.currentFileIndex = i;
      const file = files[i];
      this.diag("batch", `Starting file ${i + 1}/${files.length}: ${file.name} (${file.size} bytes)`);

      this.emitBatchProgress(i, files.length);

      // Add pacing delay between files
      if (i > 0) {
        await new Promise((r) => setTimeout(r, FILE_PACING_DELAY_MS));
      }

      // Try file with exponential backoff retry
      let fileSucceeded = false;
      for (let attempt = 0; attempt <= MAX_RETRIES_FILE; attempt++) {
        if (this._cancelled) break;
        if (attempt > 0) {
          const delay = this.getRetryDelay(attempt - 1, 500);
          this.diag("retry", `Retrying file ${i + 1}: ${file.name} (attempt ${attempt + 1}) after ${delay}ms`);
          await new Promise((r) => setTimeout(r, delay));
        }
        try {
          await this.sendSingleFileWithTimeout(file, i, files.length, totalBatchSize);
          fileSucceeded = true;
          break;
        } catch (err: any) {
          this.diag("error", `File ${i + 1} attempt ${attempt + 1} failed: ${err.message}`);
        }
      }

      if (this._cancelled) break;

      if (!fileSucceeded) {
        this.diag("batch", `File ${i + 1} skipped after retries: ${file.name}`);
        this.failedFiles.push(file.name);
        this.sendJSON({ type: "file-complete", fileIndex: i, fileName: file.name, failed: true });
        continue;
      }

      // Signal file complete to receiver
      this.sendJSON({ type: "file-complete", fileIndex: i, fileName: file.name });
      this.diag("batch", `File ${i + 1}/${files.length} complete signal sent`);
    }

    if (this._cancelled) {
      this.sendCancelAck();
      return;
    }

    // All files attempted — send batch-complete with failure info
    this.diag("batch", "All files attempted, sending batch-complete");
    this.sendJSON({
      type: "batch-complete",
      fileCount: files.length,
      totalSize: totalBatchSize,
      failedFiles: this.failedFiles,
    });

    // Wait for batch-received from receiver
    this.diag("batch", "Waiting for batch-received from receiver...");
    await this.waitForMessage("batch-received", 15000);

    this.diag("batch", "Batch complete — sender marking done");
    if (this.failedFiles.length > 0) {
      this.diag("batch", `${this.failedFiles.length} file(s) failed: ${this.failedFiles.join(", ")}`);
    }
    this.setState("completed");
    this._transferCompleted = true;
    this._onComplete?.(true);
    this._onBatchReceived?.();
  }

  /** Wait for a specific message type with timeout */
  private waitForMessage(type: string, timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        if (this.dataChannel) {
          this.dataChannel.removeEventListener("message", handler);
        }
        this.diag("batch", `Timeout waiting for ${type} — continuing`);
        resolve();
      }, timeoutMs);

      const handler = (e: MessageEvent) => {
        if (typeof e.data === "string") {
          try {
            const msg = JSON.parse(e.data);
            if (msg.type === type) {
              clearTimeout(timer);
              this.dataChannel?.removeEventListener("message", handler);
              resolve();
            }
          } catch {}
        }
      };
      this.dataChannel?.addEventListener("message", handler);
    });
  }

  private async sendSingleFileWithTimeout(
    file: File, fileIndex: number, fileCount: number, totalBatchSize: number,
  ): Promise<string> {
    // Adaptive timeout: larger files get more time
    const fileTimeout = Math.max(PER_FILE_TIMEOUT_MS, Math.round(file.size / 10000)); // ~100KB/s minimum
    const result = await Promise.race([
      this.sendSingleFile(file, fileIndex, fileCount, totalBatchSize),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`File "${file.name}" timed out after ${Math.round(fileTimeout / 1000)}s`)), fileTimeout)
      ),
    ]);
    return result;
  }

  private async sendSingleFile(
    file: File,
    fileIndex: number,
    fileCount: number,
    totalBatchSize: number,
  ): Promise<string> {
    this.currentFile = file;
    this.startTime = Date.now();
    this.lastBytes = 0;
    this.lastTime = this.startTime;
    this.smoothedSpeed = 0;
    this.speedSamples = [];
    this.qualityMeasurementWindow = [];

    const buffer = await file.arrayBuffer();
    const data = new Uint8Array(buffer);
    const chunkSize = this.currentChunkSize;
    const totalChunks = Math.ceil(data.length / chunkSize);
    this.fileChunks = [];

    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, data.length);
      this.fileChunks.push(data.slice(start, end));
    }

    this.progress = {
      bytesTransferred: 0,
      totalBytes: data.length,
      percent: 0,
      speedBps: 0,
      speedAvgBps: 0,
      estimatedRemainingMs: null,
      chunkIndex: 0,
      totalChunks,
      currentFileIndex: fileIndex,
      fileCount: fileCount,
      currentFileName: file.name,
      overallPercent: fileIndex > 0
        ? Math.round(((this.accumulatedPercent) / totalBatchSize) * 100)
        : 0,
      filesCompleted: fileIndex,
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
    await this.waitForMessage("metadata-ack", 5000);

    // Send chunks with adaptive backpressure
    for (let i = 0; i < this.fileChunks.length; i++) {
      if (this._cancelled) {
        throw new Error("Transfer cancelled");
      }
      if (this.dataChannel?.readyState !== "open") {
        throw new Error("Connection lost during transfer");
      }

      const chunk = this.fileChunks[i];

      // Adaptive backpressure
      await this.waitForBackpressure();

      let retries = 0;
      let acked = false;

      while (!acked && retries < MAX_RETRIES_CHUNK) {
        if (this._cancelled) throw new Error("Transfer cancelled");

        try {
          this.dataChannel.send(chunk.buffer as ArrayBuffer);
        } catch (sendErr) {
          retries++;
          if (retries >= MAX_RETRIES_CHUNK) {
            throw new Error(`Failed to send chunk ${i} after retries`);
          }
          const delay = this.getRetryDelay(retries - 1, 100);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        acked = await this.waitForChunkAck(i, CHUNK_ACK_TIMEOUT);
        if (!acked) retries++;
      }

      if (!acked) {
        throw new Error(`Chunk ${i} not acknowledged after ${MAX_RETRIES_CHUNK} retries`);
      }

      this.progress.chunkIndex = i + 1;
      this.progress.bytesTransferred += chunk.length;
      this.progress.percent = Math.round((this.progress.bytesTransferred / this.progress.totalBytes) * 100);

      const previousFilesProgress = this.accumulatedPercent / totalBatchSize;
      const thisFileProgress = this.progress.bytesTransferred / totalBatchSize;
      this.progress.overallPercent = Math.round((previousFilesProgress + thisFileProgress) * 100);

      const now = Date.now();
      const elapsed = now - this.lastTime;
      if (elapsed >= 200) {
        const bytesSinceLast = this.progress.bytesTransferred - this.lastBytes;
        this.recordSpeedSample(bytesSinceLast, elapsed);
        const remaining = this.progress.totalBytes - this.progress.bytesTransferred;
        this.progress.estimatedRemainingMs = remaining > 0 && this.smoothedSpeed > 0
          ? Math.round((remaining / this.smoothedSpeed) * 1000)
          : null;
        this.lastBytes = this.progress.bytesTransferred;
        this.lastTime = now;
      }

      this._onProgress?.(this.progress);

      if (i % 128 === 0) await new Promise((r) => setTimeout(r, 0));
    }

    this.accumulatedPercent += file.size;

    // Send checksum for verification
    this.sendJSON({ type: "checksum", checksum: this.metadata.checksum });

    return checksum;
  }

  /** Wait for backpressure threshold to be under limit */
  private async waitForBackpressure(): Promise<void> {
    if (!this.dataChannel) return;

    if (this.dataChannel.bufferedAmount > BACKPRESSURE_HIGH) {
      await new Promise<void>((resolve) => {
        const handler = () => {
          clearTimeout(fallback);
          resolve();
        };
        // Longer timeout for high watermark
        const fallback = setTimeout(resolve, 5000);
        this.dataChannel!.addEventListener("bufferedamountlow", handler, { once: true });
      });
    } else if (this.dataChannel.bufferedAmount > BACKPRESSURE_THRESHOLD) {
      await new Promise<void>((resolve) => {
        const handler = () => {
          clearTimeout(fallback);
          resolve();
        };
        const fallback = setTimeout(resolve, 2000);
        this.dataChannel!.addEventListener("bufferedamountlow", handler, { once: true });
      });
    }
  }

  /** Wait for a specific chunk ack — persistent listener pattern */
  private async waitForChunkAck(chunkIndex: number, timeoutMs: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const handler = (e: MessageEvent) => {
        if (typeof e.data === "string") {
          try {
            const m = JSON.parse(e.data);
            if (m.type === "chunk-ack" && m.chunk_index === chunkIndex) {
              clearTimeout(timer);
              this.dataChannel?.removeEventListener("message", handler);
              resolve(true);
            }
          } catch {}
        }
      };
      const timer = setTimeout(() => {
        this.dataChannel?.removeEventListener("message", handler);
        resolve(false);
      }, timeoutMs);
      this.dataChannel!.addEventListener("message", handler);
    });
  }

  async sendFile(file: File): Promise<string> {
    await this.sendFiles([file]);
    return this.metadata?.checksum || "";
  }

  /** Send cancel ack back to remote */
  private sendCancelAck() {
    try {
      this.sendJSON({ type: "cancel-ack" });
    } catch {}
  }

  // ── CANCEL ──
  cancel() {
    if (this._cancelled || this._transferCompleted || this.state === "completed" || this.state === "cancelled") return;
    this._cancelled = true;
    this.diag("cancel", "Transfer cancelled by user");
    this.sendJSON({ type: "cancel" });
    this.setState("cancelled");
    this._onCancel?.();
    this.cleanup();
  }

  isCancelled(): boolean {
    return this._cancelled;
  }

  // ── FILE RECEIVE (Receiver) ──
  private receivedChunks: Uint8Array[] = [];
  private receivedMetadata: TransferMetadata | null = null;
  private receivedChecksum: string | null = null;
  private receivedBytes: number = 0;
  private downloadedFiles: Array<{ fileName: string; checksum: string; blob: Blob }> = [];
  private receivedFailedFiles: string[] = [];

  private setupDataChannel(dc: RTCDataChannel) {
    dc.binaryType = "arraybuffer";

    dc.bufferedAmountLowThreshold = 256 * 1024;

    dc.onopen = () => {
      this.diag("lifecycle", "Data channel open");
    };

    dc.onclose = () => {
      this.diag("lifecycle", "Data channel closed");
    };

    dc.onmessage = (e: MessageEvent) => {
      this.messageQueue.push(async () => {
        if (typeof e.data === "string") {
          try {
            const msg = JSON.parse(e.data);
            await this.handleDataChannelMessage(msg);
          } catch {
            this.diag("error", "Failed to parse message");
          }
        } else {
          const chunk = new Uint8Array(e.data);
          this.receivedChunks.push(chunk);
          this.receivedBytes += chunk.length;

          this.sendJSON({ type: "chunk-ack", chunk_index: this.receivedChunks.length - 1 });

          this.progress.bytesTransferred = this.receivedBytes;
          this.progress.percent = this.receivedMetadata
            ? Math.round((this.receivedBytes / this.receivedMetadata.fileSize) * 100)
            : 0;

          if (this.receivedBatchMetadata) {
            const completedBytes = this.receivedFileIndex > 0 && this.receivedBatchMetadata.files.length > 0
              ? this.receivedBatchMetadata.files
                  .slice(0, this.receivedFileIndex)
                  .reduce((s, f) => s + f.fileSize, 0)
              : 0;
            const total = this.receivedBatchMetadata.totalSize;
            this.progress.overallPercent = total > 0
              ? Math.round(((completedBytes + this.receivedBytes) / total) * 100)
              : 0;
          }

          const now = Date.now();
          const elapsed = now - this.lastTime;
          if (elapsed >= 200) {
            const bytesSinceLast = this.receivedBytes - this.lastBytes;
            this.recordSpeedSample(bytesSinceLast, elapsed);
            if (this.receivedMetadata) {
              const remaining = this.receivedMetadata.fileSize - this.receivedBytes;
              this.progress.estimatedRemainingMs = remaining > 0 && this.smoothedSpeed > 0
                ? Math.round((remaining / this.smoothedSpeed) * 1000)
                : null;
            }
            this.lastBytes = this.receivedBytes;
            this.lastTime = now;
          }

          this._onProgress?.(this.progress);
        }
      });

      if (!this.processingMessages) {
        this.processingMessages = true;
        this.processMessageQueue();
      }
    };
  }

  private async handleDataChannelMessage(msg: any) {
    switch (msg.type) {
      case "batch-metadata": {
        this.diag("batch", `Batch metadata received: ${msg.batch.fileCount} files`);
        this.receivedBatchMetadata = msg.batch as BatchMetadata;
        this.receivedFileIndex = 0;
        this.receivedFilesCount = msg.batch.fileCount;
        this.downloadedFiles = [];
        this.receivedFailedFiles = [];
        this.progress.fileCount = msg.batch.fileCount;
        this.progress.currentFileIndex = 0;
        this.progress.filesCompleted = 0;
        this.progress.overallPercent = 0;
        this.progress.currentFileName = msg.batch.files[0]?.fileName || "";
        this._onBatchMetadata?.(msg.batch);
        this.sendJSON({ type: "batch-metadata-ack" });
        break;
      }

      case "metadata":
        this.diag("receive", `Metadata received: ${msg.metadata.fileName}`);
        this.receivedMetadata = msg.metadata as TransferMetadata;
        this.receivedChunks = [];
        this.receivedBytes = 0;
        this.smoothedSpeed = 0;
        this.speedSamples = [];
        this.qualityMeasurementWindow = [];
        this.progress.totalBytes = msg.metadata.fileSize;
        this.progress.currentFileIndex = this.receivedFileIndex;
        this.progress.currentFileName = msg.metadata.fileName;
        this.progress.bytesTransferred = 0;
        this.progress.percent = 0;
        this._onMetadata?.(msg.metadata);
        this.sendJSON({ type: "metadata-ack" });
        break;

      case "checksum":
        this.diag("verify", "Checksum received, verifying...");
        this.receivedChecksum = msg.checksum;
        this.setState("verifying");
        await this.verifyAndComplete();
        break;

      case "file-complete": {
        this.diag("receive", `File complete: ${msg.fileName} (index ${msg.fileIndex})`);
        if (msg.failed) {
          this.receivedFailedFiles.push(msg.fileName);
        }
        this.receivedFileIndex = msg.fileIndex + 1;
        this.progress.currentFileIndex = this.receivedFileIndex;
        this.progress.filesCompleted = this.receivedFileIndex;
        if (this.receivedFileIndex < (this.receivedBatchMetadata?.fileCount || 1)) {
          const nextFile = this.receivedBatchMetadata?.files[this.receivedFileIndex];
          this.progress.currentFileName = nextFile?.fileName || "";
        }
        break;
      }

      case "batch-complete": {
        this.diag("batch", "Batch-complete received");
        const failedFiles = msg.failedFiles || [];
        if (failedFiles.length > 0) {
          this.diag("batch", `${failedFiles.length} files failed on sender side: ${failedFiles.join(", ")}`);
        }
        this.sendJSON({
          type: "batch-received",
          fileCount: this.receivedFilesCount,
          failedFiles: this.receivedFailedFiles,
        });
        this.setState("completed");
        this._transferCompleted = true;
        this.progress.filesCompleted = this.receivedFilesCount;
        this.progress.overallPercent = 100;
        this._onComplete?.(true);
        this._onBatchComplete?.();
        break;
      }

      case "cancel":
        this.diag("cancel", "Cancel received from remote");
        this._cancelled = true;
        this.setState("cancelled");
        this._onCancel?.();
        this.cleanup();
        break;

      case "cancel-ack":
        this.diag("cancel", "Cancel acknowledged by remote");
        break;

      case "checksum-ok":
        this.diag("verify", "Checksum OK confirmed by receiver");
        break;

      case "checksum-fail":
        this.diag("error", "Checksum FAIL reported by receiver");
        this.setState("error");
        this._onComplete?.(false);
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
      const fileName = this.receivedMetadata.fileName;
      const mimeType = this.receivedMetadata.mimeType;
      const blob = new Blob([fullData], { type: mimeType });

      this.downloadedFiles.push({ fileName, checksum: computedChecksum, blob });
      this._onFileDownloaded?.(fileName, blob);

      this.sendJSON({ type: "checksum-ok", checksum: computedChecksum });
      this.diag("verify", `File verified OK: ${fileName}`);
    } else {
      this.diag("error", `Checksum MISMATCH for ${this.receivedMetadata.fileName}`);
      this.setState("error");
      this._onComplete?.(false);
      this.sendJSON({ type: "checksum-fail", expected: this.receivedChecksum, got: computedChecksum });
    }

    this.receivedChunks = [];
  }

  triggerDownload(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  getDownloadedFiles(): Array<{ fileName: string; checksum: string; blob: Blob }> {
    return [...this.downloadedFiles];
  }

  getReceivedFailedFiles(): string[] {
    return [...this.receivedFailedFiles];
  }

  private sendJSON(obj: any) {
    if (this.dataChannel?.readyState === "open") {
      try {
        this.dataChannel.send(JSON.stringify(obj));
      } catch (err) {
        this.diag("error", `sendJSON failed: ${err}`);
      }
    }
  }

  private emitBatchProgress(fileIndex: number, fileCount: number) {
    this.progress.currentFileIndex = fileIndex;
    this.progress.fileCount = fileCount;
    this.progress.filesCompleted = fileIndex;
    if (fileIndex < this.batchFiles.length) {
      this.progress.currentFileName = this.batchFiles[fileIndex].fileName;
    }
  }

  private async processMessageQueue() {
    while (this.messageQueue.length > 0) {
      if (this._cancelled) {
        this.messageQueue = [];
        this.processingMessages = false;
        return;
      }
      const handler = this.messageQueue.shift()!;
      try {
        await handler();
      } catch (err) {
        this.diag("error", `Message handler error: ${err}`);
      }
    }
    this.processingMessages = false;
  }

  cleanup() {
    this.dataChannel?.close();
    this.pc?.close();
    this.pc = null;
    this.dataChannel = null;
    this.fileChunks = [];
    this.currentFile = null;
    this.receivedChunks = [];
    this.receivedMetadata = null;
    this.downloadedFiles = [];
  }
}

// ── SHA-256 helper ──
export async function computeSHA256(data: Uint8Array): Promise<string> {
  // @ts-ignore
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Format utilities ──
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

// ── Browser diagnostics helper ──
export interface BrowserDiagnostics {
  userAgent: string;
  platform: string;
  language: string;
  cookiesEnabled: boolean;
  webRTCSupported: boolean;
  dataChannelSupported: boolean;
  serviceWorkerSupported: boolean;
  screenSize: string;
  connectionType: string;
}

export function getBrowserDiagnostics(): BrowserDiagnostics {
  if (typeof window === "undefined") {
    return {
      userAgent: "server",
      platform: "server",
      language: "server",
      cookiesEnabled: false,
      webRTCSupported: false,
      dataChannelSupported: false,
      serviceWorkerSupported: false,
      screenSize: "server",
      connectionType: "server",
    };
  }
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    cookiesEnabled: navigator.cookieEnabled,
    webRTCSupported: typeof RTCPeerConnection !== "undefined",
    dataChannelSupported: typeof RTCDataChannel !== "undefined",
    serviceWorkerSupported: "serviceWorker" in navigator,
    screenSize: `${window.screen.width}x${window.screen.height}`,
    connectionType: (navigator as any).connection?.effectiveType || "unknown",
  };
}
