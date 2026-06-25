/**
 * OpenSend v0.3.x — WebRTC Engine with Reliability Hardening
 *
 * Core RTCPeerConnection + DataChannel management for direct device-to-device
 * file transfer. Handles connection lifecycle, ICE negotiation, data channels,
 * chunked file transfer with progress tracking, checksum verification, and
 * batch (multi-file) transfers with per-file resilience.
 *
 * Reliability features:
 *  - Per-file retry (1 retry per failed file)
 *  - Resumable batch: failed files are skipped, rest continue
 *  - ICE restart on connection loss (2 attempts)
 *  - 8KB chunks for Safari compatibility
 *  - DataChannel bufferedAmount backpressure (drain events)
 *  - Per-file timeout (120s for large files)
 *  - Pacing delay between files
 *  - Sender waits for batch-received before marking completed
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
    | "batch-received" | "all-files-verified";
  payload: any;
  sessionId: string;
  senderDeviceId: string;
  receiverDeviceId: string;
};

const CHUNK_SIZE = 8192;
const PER_FILE_TIMEOUT_MS = 120000; // 120s per file (doubled from 60s for large files)
const FILE_PACING_DELAY_MS = 100;
const MAX_RECONNECT_ATTEMPTS = 2;
const RECONNECT_DELAY_MS = 2000;

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
  private _debug: boolean = false;
  private _transferCompleted: boolean = false;
  private _reconnectAttempts: number = 0;

  // Batch state (sender)
  private batchFiles: BatchFileInfo[] = [];
  private currentFileIndex: number = 0;
  private batchFileCount: number = 1;
  private failedFiles: string[] = []; // track failed files for resumable batch

  // Batch state (receiver)
  private receivedBatchMetadata: BatchMetadata | null = null;
  private receivedFileIndex: number = 0;
  private receivedFilesCount: number = 1;
  private accumulatedPercent: number = 0;

  /** Message queue to serialize async DataChannel message processing */
  private messageQueue: Array<() => Promise<void>> = [];
  private processingMessages: boolean = false;

  /** Diagnostic log */
  private diagLog: string[] = [];

  state: TransferState = "idle";
  progress: TransferProgress = {
    bytesTransferred: 0, totalBytes: 0, percent: 0,
    speedBps: 0, estimatedRemainingMs: null,
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

  getDiagLog(): string { return this.diagLog.join("\n"); }
  getFailedFiles(): string[] { return [...this.failedFiles]; }
  getCompletedFilesCount(): number { return this.progress.filesCompleted ?? 0; }

  /** Collect structured diagnostics */
  getDiagnostics(): Record<string, unknown> {
    return {
      state: this.state,
      transferCompleted: this._transferCompleted,
      bytesTransferred: this.progress.bytesTransferred,
      totalBytes: this.progress.totalBytes,
      percent: this.progress.percent,
      speedBps: this.progress.speedBps,
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
      log: this.diagLog.slice(-20),
    };
  }

  private diag(msg: string) {
    this.diagLog.push(`[${Date.now()}] ${msg}`);
    if (this._debug) console.log("[WebRTC]", msg);
  }

  private setState(s: TransferState) {
    this.state = s;
    this._onStateChange?.(s);
  }

  // ── SENDER: Initiate connection ──
  async createConnection(sessionId: string, onSignal: (msg: SignalMessage) => void): Promise<RTCDataChannel> {
    this.diag("Creating sender connection");
    try {
      this.pc = new RTCPeerConnection({ iceServers: getIceServers() });
    } catch (err) {
      this.diag(`RTCPeerConnection constructor failed: ${err}`);
      throw new Error(`WebRTC not available: ${err}`);
    }
    this.setState("negotiating");

    try {
      this.dataChannel = this.pc.createDataChannel("filedata", {
        ordered: true,
      });
    } catch (err) {
      this.diag(`createDataChannel failed: ${err}`);
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
      this.diag(`ICE state: ${this.pc?.iceConnectionState}`);
      if (this.pc?.iceConnectionState === "failed") {
        this.diag("ICE connection failed — attempting restart");
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
      this.diag(`Connection state: ${this.pc?.connectionState}`);
      if (this._transferCompleted) return;
      if (this.pc?.connectionState === "connected") {
        this._reconnectAttempts = 0;
        if (this.state === "negotiating") {
          this.setState("transferring");
        }
      } else if (this.pc?.connectionState === "failed") {
        if (this._reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          this.diag(`Connection failed — restarting ICE (attempt ${this._reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);
          this.attemptIceRestart(onSignal, sessionId);
        } else {
          this.diag(`Connection failed after ${MAX_RECONNECT_ATTEMPTS} reconnect attempts`);
          this.diag("STUN/TURN could not establish a direct connection.");
          this.setState("error");
        }
      } else if (this.pc?.connectionState === "disconnected") {
        setTimeout(() => {
          if (this.pc?.connectionState === "disconnected" && !this._transferCompleted) {
            if (this._reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
              this.diag("Connection stayed disconnected — restarting ICE");
              this.attemptIceRestart(onSignal, sessionId);
            } else {
              this.diag("Connection stayed disconnected after reconnect attempts — failing");
              this.setState("error");
            }
          }
        }, 5000);
      }
    };

    let offer;
    try {
      offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
    } catch (err) {
      this.diag(`createOffer/setLocalDescription failed: ${err}`);
      throw new Error(`WebRTC offer creation failed: ${err}`);
    }
    this.diag("Offer created");
    onSignal({
      type: "offer",
      payload: offer,
      sessionId,
      senderDeviceId: "",
      receiverDeviceId: "",
    });

    return this.dataChannel;
  }

  // ── ICE RESTART ──
  private async attemptIceRestart(onSignal: (msg: SignalMessage) => void, sessionId: string) {
    if (!this.pc || this._transferCompleted) return;
    if (this._reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;

    this._reconnectAttempts++;
    this.diag(`ICE restart attempt ${this._reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);

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
      this.diag("ICE restart offer sent");
    } catch (err) {
      this.diag(`ICE restart failed: ${err}`);
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
    this.diag("Creating receiver connection");
    this.pc = new RTCPeerConnection({ iceServers: getIceServers() });
    this.setState("negotiating");

    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    this.diag("Remote description set (offer)");

    this.pc.ondatachannel = (e) => {
      this.diag("Incoming data channel received");
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
      this.diag(`Receiver ICE state: ${this.pc?.iceConnectionState}`);
      if (this.pc?.iceConnectionState === "failed") {
        this.diag("Receiver ICE failed — attempting restart");
      }
    };

    this.pc.onconnectionstatechange = () => {
      this.diag(`Receiver connection state: ${this.pc?.connectionState}`);
      if (this._transferCompleted) return;
      if (this.pc?.connectionState === "connected") {
        this.setState("transferring");
      } else if (this.pc?.connectionState === "failed") {
        this.diag(`Receiver connection failed — ICE: ${this.pc?.iceConnectionState}`);
        this.setState("error");
      } else if (this.pc?.connectionState === "disconnected") {
        setTimeout(() => {
          if (this.pc?.connectionState === "disconnected" && !this._transferCompleted) {
            this.diag("Receiver stayed disconnected — failing");
            this.setState("error");
          }
        }, 5000);
      }
    };

    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    this.diag("Answer created");
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
          this.diag("Data channel received");
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
        this.diag("Handling offer signal");
        await this.pc.setRemoteDescription(new RTCSessionDescription(msg.payload));
        for (const c of this.pendingCandidates) {
          await this.pc.addIceCandidate(c).catch(() => {});
        }
        this.pendingCandidates = [];
        break;

      case "answer":
        this.diag("Handling answer signal");
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

    this.diag(`Starting batch send: ${files.length} files`);
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
    this.diag("Batch metadata sent");

    // Wait for batch-metadata ack
    await new Promise<void>((resolve) => {
      const handler = (e: MessageEvent) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "batch-metadata-ack") resolve();
        } catch {}
      };
      this.dataChannel!.addEventListener("message", handler, { once: true });
      setTimeout(resolve, 2000);
    });
    this.diag("Batch metadata acknowledged");

    // Transfer each file sequentially, skipping failed ones
    for (let i = 0; i < files.length; i++) {
      this.currentFileIndex = i;
      const file = files[i];
      this.diag(`Starting file ${i + 1}/${files.length}: ${file.name} (${file.size} bytes)`);

      this.emitBatchProgress(i, files.length);

      // Add pacing delay between files
      if (i > 0) {
        this.diag(`Pacing ${FILE_PACING_DELAY_MS}ms before next file`);
        await new Promise((r) => setTimeout(r, FILE_PACING_DELAY_MS));
      }

      // Try file with 1 retry
      let fileSucceeded = false;
      for (let attempt = 0; attempt <= 1; attempt++) {
        if (attempt > 0) {
          this.diag(`Retrying file ${i + 1}: ${file.name} (attempt ${attempt + 1})`);
        }
        try {
          await this.sendSingleFileWithTimeout(file, i, files.length, totalBatchSize);
          fileSucceeded = true;
          break;
        } catch (err: any) {
          this.diag(`File ${i + 1} attempt ${attempt + 1} failed: ${err.message}`);
        }
      }

      if (!fileSucceeded) {
        this.diag(`File ${i + 1} skipped after retries: ${file.name}`);
        this.failedFiles.push(file.name);
        // Send file-complete anyway so receiver continues
        this.sendJSON({ type: "file-complete", fileIndex: i, fileName: file.name, failed: true });
        continue;
      }

      // Signal file complete to receiver
      this.sendJSON({ type: "file-complete", fileIndex: i, fileName: file.name });
      this.diag(`File ${i + 1}/${files.length} complete signal sent`);
    }

    // All files attempted — send batch-complete with failure info
    this.diag("All files attempted, sending batch-complete");
    this.sendJSON({
      type: "batch-complete",
      fileCount: files.length,
      totalSize: totalBatchSize,
      failedFiles: this.failedFiles,
    });

    // Wait for batch-received from receiver
    this.diag("Waiting for batch-received from receiver...");
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.diag("Timeout waiting for batch-received — marking complete anyway");
        resolve();
      }, 10000);

      const handler = (e: MessageEvent) => {
        if (typeof e.data === "string") {
          try {
            const msg = JSON.parse(e.data);
            if (msg.type === "batch-received") {
              this.diag("Batch-received confirmed by receiver");
              clearTimeout(timer);
              resolve();
            }
          } catch {}
        }
      };
      this.dataChannel!.addEventListener("message", handler, { once: true });
    });

    this.diag("Batch complete — sender marking done");
    if (this.failedFiles.length > 0) {
      this.diag(`${this.failedFiles.length} file(s) failed: ${this.failedFiles.join(", ")}`);
    }
    this.setState("completed");
    this._transferCompleted = true;
    this._onComplete?.(true);
    this._onBatchReceived?.();
  }

  private async sendSingleFileWithTimeout(
    file: File, fileIndex: number, fileCount: number, totalBatchSize: number,
  ): Promise<string> {
    const result = await Promise.race([
      this.sendSingleFile(file, fileIndex, fileCount, totalBatchSize),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`File "${file.name}" timed out after ${PER_FILE_TIMEOUT_MS / 1000}s`)), PER_FILE_TIMEOUT_MS)
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
    await new Promise<void>((resolve) => {
      const handler = (e: MessageEvent) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "metadata-ack") resolve();
        } catch {}
      };
      this.dataChannel!.addEventListener("message", handler, { once: true });
      setTimeout(resolve, 2000);
    });

    // Send chunks with bufferedAmount backpressure
    const RETRY_MAX = 3;
    const ACK_TIMEOUT = 500;

    for (let i = 0; i < this.fileChunks.length; i++) {
      if (this.dataChannel?.readyState !== "open") {
        throw new Error("Connection lost during transfer");
      }

      const chunk = this.fileChunks[i];

      // Backpressure: wait if buffer is getting full
      if (this.dataChannel && this.dataChannel.bufferedAmount > 1024 * 1024) {
        await new Promise<void>((resolve) => {
          const handler = () => {
            clearTimeout(fallback);
            resolve();
          };
          const fallback = setTimeout(resolve, 2000);
          this.dataChannel!.addEventListener("bufferedamountlow", handler, { once: true });
        });
      }

      let retries = 0;
      let acked = false;

      while (!acked && retries < RETRY_MAX) {
        try {
          this.dataChannel.send(chunk.buffer as ArrayBuffer);
        } catch (sendErr) {
          retries++;
          if (retries >= RETRY_MAX) {
            throw new Error(`Failed to send chunk ${i} after retries`);
          }
          await new Promise((r) => setTimeout(r, 100 * retries));
          continue;
        }

        acked = await new Promise<boolean>((resolve) => {
          const handler = (e: MessageEvent) => {
            if (typeof e.data === "string") {
              try {
                const m = JSON.parse(e.data);
                if (m.type === "chunk-ack" && m.chunk_index === i) {
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
          }, ACK_TIMEOUT);
          this.dataChannel!.addEventListener("message", handler);
        });

        if (!acked) retries++;
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
        this.progress.speedBps = Math.round(bytesSinceLast / (elapsed / 1000));
        const remaining = this.progress.totalBytes - this.progress.bytesTransferred;
        this.progress.estimatedRemainingMs = remaining > 0 && this.progress.speedBps > 0
          ? Math.round((remaining / this.progress.speedBps) * 1000)
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

  async sendFile(file: File): Promise<string> {
    await this.sendFiles([file]);
    return this.metadata?.checksum || "";
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
      this.diag("Data channel open");
    };

    dc.onclose = () => {
      this.diag("Data channel closed");
    };

    dc.onmessage = (e: MessageEvent) => {
      this.messageQueue.push(async () => {
        if (typeof e.data === "string") {
          try {
            const msg = JSON.parse(e.data);
            await this.handleDataChannelMessage(msg);
          } catch {
            this.diag("Failed to parse message");
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
        this.diag(`Batch metadata received: ${msg.batch.fileCount} files`);
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
        this.diag(`Metadata received: ${msg.metadata.fileName}`);
        this.receivedMetadata = msg.metadata as TransferMetadata;
        this.receivedChunks = [];
        this.receivedBytes = 0;
        this.progress.totalBytes = msg.metadata.fileSize;
        this.progress.currentFileIndex = this.receivedFileIndex;
        this.progress.currentFileName = msg.metadata.fileName;
        this.progress.bytesTransferred = 0;
        this.progress.percent = 0;
        this._onMetadata?.(msg.metadata);
        this.sendJSON({ type: "metadata-ack" });
        break;

      case "checksum":
        this.diag("Checksum received, verifying...");
        this.receivedChecksum = msg.checksum;
        this.setState("verifying");
        await this.verifyAndComplete();
        break;

      case "file-complete": {
        this.diag(`File complete: ${msg.fileName} (index ${msg.fileIndex})`);
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
        this.diag("Batch-complete received");
        const failedFiles = msg.failedFiles || [];
        if (failedFiles.length > 0) {
          this.diag(`${failedFiles.length} files failed on sender side: ${failedFiles.join(", ")}`);
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
        this.diag("Cancel received from remote");
        this.setState("cancelled");
        this.cleanup();
        break;

      case "checksum-ok":
        this.diag("Checksum OK confirmed by receiver");
        break;

      case "checksum-fail":
        this.diag("Checksum FAIL reported by receiver");
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
      this.diag(`File verified OK: ${fileName}`);
    } else {
      this.diag(`Checksum MISMATCH for ${this.receivedMetadata.fileName}`);
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
      this.dataChannel.send(JSON.stringify(obj));
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
      const handler = this.messageQueue.shift()!;
      try {
        await handler();
      } catch (err) {
        this.diag(`Message handler error: ${err}`);
      }
    }
    this.processingMessages = false;
  }

  cancel() {
    this.sendJSON({ type: "cancel" });
    this.setState("cancelled");
    this.cleanup();
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
