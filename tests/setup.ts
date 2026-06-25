/**
 * OpenSend Test Setup
 *
 * Sets up minimal DOM and WebRTC polyfills needed to test
 * the WebRTC engine in a Node.js environment under vitest.
 *
 * Polyfills:
 *  - DOM shim (window, document, URL, Blob, navigator)
 *  - RTCPeerConnection (mock with configurable behavior)
 *  - RTCDataChannel (mock with configurable readyState)
 *  - RTCSessionDescription
 *  - RTCIceCandidate
 *  - crypto.subtle.digest (Node.js native via globalThis.crypto)
 *  - MessageEvent
 *  - Uint8Array, ArrayBuffer (native)
 *  - TextEncoder / TextDecoder (native via util)
 */

import { TextEncoder, TextDecoder } from "node:util";
import { randomUUID } from "node:crypto";

// ── Ensure TextEncoder/TextDecoder are available (global in Node ≥ 19) ──
if (typeof globalThis.TextEncoder === "undefined") {
  (globalThis as any).TextEncoder = TextEncoder;
}
if (typeof globalThis.TextDecoder === "undefined") {
  (globalThis as any).TextDecoder = TextDecoder;
}

// ── Minimal DOM shim ─────────────────────────────────────────────────

if (typeof globalThis.document === "undefined") {
  (globalThis as any).document = {
    createElement(tag: string) {
      return {
        tagName: tag.toUpperCase(),
        href: "",
        download: "",
        style: { display: "none" },
        click: () => {},
        appendChild: () => {},
        removeChild: () => {},
      };
    },
    body: {
      appendChild: () => {},
      removeChild: () => {},
    },
    createTextNode: (text: string) => ({ textContent: text }),
  } as any;
}

if (typeof globalThis.window === "undefined") {
  (globalThis as any).window = globalThis;
}

if (typeof globalThis.navigator === "undefined") {
  (globalThis as any).navigator = {
    userAgent: "node/vitest",
    platform: "Node.js",
    language: "en-US",
    cookieEnabled: false,
  };
}

// ── URL shim ─────────────────────────────────────────────────────────

// URL.createObjectURL / URL.revokeObjectURL
if (typeof URL.createObjectURL === "undefined") {
  const objectUrls = new Map<string, Blob>();
  let counter = 0;

  (URL as any).createObjectURL = (blob: Blob): string => {
    const url = `blob:nodedroid:${randomUUID()}-${counter++}`;
    objectUrls.set(url, blob);
    return url;
  };

  (URL as any).revokeObjectURL = (url: string): void => {
    objectUrls.delete(url);
  };
}

// ── Blob shim (native in Node ≥ 20) ──────────────────────────────────

if (typeof globalThis.Blob === "undefined") {
  (globalThis as any).Blob = class MockBlob {
    private parts: any[];
    private _type: string;

    constructor(parts: any[], options?: { type?: string }) {
      this.parts = parts;
      this._type = options?.type ?? "";
    }

    get size(): number {
      return this.parts.reduce((acc: number, p: any) => {
        if (typeof p === "string") return acc + p.length;
        if (p instanceof ArrayBuffer) return acc + p.byteLength;
        if (p instanceof Uint8Array) return acc + p.byteLength;
        if (Array.isArray(p)) return acc + new MockBlob(p).size;
        return acc;
      }, 0);
    }

    get type(): string {
      return this._type;
    }

    async arrayBuffer(): Promise<ArrayBuffer> {
      const buf = new Uint8Array(this.size);
      let offset = 0;
      for (const p of this.parts) {
        if (typeof p === "string") {
          buf.set(new TextEncoder().encode(p), offset);
          offset += p.length;
        } else if (p instanceof Uint8Array) {
          buf.set(p, offset);
          offset += p.byteLength;
        } else if (p instanceof ArrayBuffer) {
          buf.set(new Uint8Array(p), offset);
          offset += p.byteLength;
        }
      }
      return buf.buffer;
    }

    slice(start?: number, end?: number, contentType?: string): Blob {
      return new MockBlob([], { type: contentType }) as unknown as Blob;
    }

    text(): Promise<string> {
      return this.arrayBuffer().then((buf) => new TextDecoder().decode(buf));
    }

    async bytes(): Promise<Uint8Array> {
      const buf = await this.arrayBuffer();
      return new Uint8Array(buf);
    }

    stream(): ReadableStream<Uint8Array> {
      return new ReadableStream({
        start: async (controller) => {
          const buf = await this.arrayBuffer();
          controller.enqueue(new Uint8Array(buf));
          controller.close();
        },
      });
    }
  } as any;
}

// ── WebRTC mocks ─────────────────────────────────────────────────────

// Ensure we're in test mode
(globalThis as any).__VITEST__ = true;

/**
 * Mock RTCSessionDescription
 */
export class MockRTCSessionDescription implements RTCSessionDescription {
  type: RTCSdpType;
  sdp: string;

  constructor(init: RTCSessionDescriptionInit) {
    this.type = init.type;
    this.sdp = init.sdp ?? "";
  }

  toJSON(): RTCSessionDescriptionInit {
    return { type: this.type, sdp: this.sdp };
  }
}

/**
 * Mock RTCIceCandidate
 */
export class MockRTCIceCandidate implements RTCIceCandidate {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
  foundation: string;
  component: RTCIceComponent | null;
  priority: number | null;
  ip: string | null;
  address: string | null;
  protocol: RTCIceProtocol | null;
  port: number | null;
  type: RTCIceCandidateType | null;
  tcpType: RTCIceTcpCandidateType | null;
  relatedAddress: string | null;
  relatedPort: number | null;
  usernameFragment: string | null;

  constructor(init: RTCIceCandidateInit | string) {
    if (typeof init === "string") {
      this.candidate = init;
      this.sdpMid = null;
      this.sdpMLineIndex = null;
    } else {
      this.candidate = init.candidate ?? "";
      this.sdpMid = init.sdpMid ?? null;
      this.sdpMLineIndex = init.sdpMLineIndex ?? null;
    }
    this.foundation = "";
    this.component = "rtp";
    this.priority = 0;
    this.ip = "127.0.0.1";
    this.address = "127.0.0.1";
    this.protocol = "udp";
    this.port = 0;
    this.type = "host";
    this.tcpType = null as unknown as RTCIceTcpCandidateType | null;
    this.relatedAddress = null;
    this.relatedPort = null;
    this.usernameFragment = null;
  }

  toJSON(): RTCIceCandidateInit {
    return { candidate: this.candidate, sdpMid: this.sdpMid, sdpMLineIndex: this.sdpMLineIndex };
  }
}

/**
 * Mock RTCDataChannel.
 * Provides configurable readyState and an event-emitter-like interface
 * for unit testing the engine's data channel interactions.
 */
export class MockRTCDataChannel implements EventTarget {
  private listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  private _readyState: RTCDataChannelState = "connecting";
  private _bufferedAmount = 0;
  bufferedAmountLowThreshold = 256 * 1024;
  binaryType: BinaryType = "arraybuffer";
  id: number | null = null;
  label: string;
  maxPacketLifeTime: number | null = null;
  maxRetransmits: number | null = null;
  negotiated: boolean = false;
  ordered: boolean = true;
  protocol: string = "";
  priority: RTCPriorityType = "medium";

  constructor(label: string = "filedata") {
    this.label = label;
  }

  get readyState(): RTCDataChannelState {
    return this._readyState;
  }

  set readyState(state: RTCDataChannelState) {
    this._readyState = state;
    if (state === "open") {
      this.dispatchEvent(new MockEvent("open"));
    } else if (state === "closed") {
      this.dispatchEvent(new MockEvent("close"));
    }
  }

  get bufferedAmount(): number {
    return this._bufferedAmount;
  }

  /** Simulate sending data — increases bufferedAmount for backpressure tests. */
  send(data: string | ArrayBuffer | ArrayBufferView | Blob): void {
    if (this._readyState !== "open") {
      throw new DOMException("DataChannel is not open", "InvalidStateError");
    }
    if (typeof data === "string") {
      this._bufferedAmount += data.length;
    } else if (data instanceof ArrayBuffer) {
      this._bufferedAmount += data.byteLength;
    } else if (ArrayBuffer.isView(data)) {
      this._bufferedAmount += data.byteLength;
    }
  }

  /** Simulate drain — sets bufferedAmount to 0 and fires bufferedamountlow. */
  drain(): void {
    this._bufferedAmount = 0;
    this.dispatchEvent(new MockEvent("bufferedamountlow"));
  }

  close(): void {
    this._readyState = "closed";
    this.dispatchEvent(new MockEvent("close"));
  }

  // ── EventTarget implementation ──

  addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: AddEventListenerOptions | boolean,
  ): void {
    if (!callback) return;
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(callback);
  }

  removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: EventListenerOptions | boolean,
  ): void {
    if (!callback) return;
    this.listeners.get(type)?.delete(callback);
  }

  dispatchEvent(event: Event): boolean {
    const handlers = this.listeners.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        if (typeof handler === "function") {
          handler(event);
        } else {
          handler.handleEvent(event);
        }
      }
    }
    return true;
  }

  /** Simulate receiving a message on the channel. */
  receiveMessage(data: string | ArrayBuffer): void {
    const event = new MockMessageEvent("message", { data });
    this.dispatchEvent(event);
  }
}

/**
 * Mock MessageEvent
 */
class MockMessageEvent extends Event implements MessageEvent {
  data: any;
  origin: string = "";
  lastEventId: string = "";
  source: MessageEventSource | null = null;
  ports: ReadonlyArray<MessagePort> = [];
  constructor(type: string, init: { data: any }) {
    super(type);
    this.data = init.data;
  }
  initMessageEvent(
    type: string,
    bubbles?: boolean,
    cancelable?: boolean,
    data?: any,
    origin?: string,
    lastEventId?: string,
    source?: MessageEventSource | null,
    ports?: MessagePort[],
  ): void {
    throw new Error("Not implemented");
  }
}

/**
 * Mock Event
 */
class MockEvent extends Event {
  constructor(type: string) {
    super(type);
  }
}

/**
 * Mock RTCPeerConnection.
 * Provides configurable ICE/connection state and the ability to
 * intercept createOffer / createAnswer / setLocalDescription / etc.
 */
export class MockRTCPeerConnection implements EventTarget {
  private listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  private _iceConnectionState: RTCIceConnectionState = "new";
  private _connectionState: RTCPeerConnectionState = "new";
  private _iceGatheringState: RTCIceGatheringState = "new";
  private _signalingState: RTCSignalingState = "stable";
  localDescription: RTCSessionDescription | null = null;
  remoteDescription: RTCSessionDescription | null = null;
  currentLocalDescription: RTCSessionDescription | null = null;
  currentRemoteDescription: RTCSessionDescription | null = null;
  pendingLocalDescription: RTCSessionDescription | null = null;
  pendingRemoteDescription: RTCSessionDescription | null = null;
  iceConnectionState: RTCIceConnectionState = "new";
  connectionState: RTCPeerConnectionState = "new";
  iceGatheringState: RTCIceGatheringState = "new";
  signalingState: RTCSignalingState = "stable";
  sctp: RTCSctpTransport | null = null;

  /** Callbacks set by engine */
  ondatachannel: ((ev: RTCDataChannelEvent) => void) | null = null;
  onicecandidate: ((ev: RTCPeerConnectionIceEvent) => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  onnegotiationneeded: (() => void) | null = null;
  onsignalingstatechange: (() => void) | null = null;

  /** Track created data channels for tests to inspect */
  createdChannels: MockRTCDataChannel[] = [];

  constructor(private config?: RTCConfiguration) {
    // default
  }

  /** Set ICE connection state and fire the callback */
  setIceConnectionState(state: RTCIceConnectionState): void {
    this._iceConnectionState = state;
    this.iceConnectionState = state;
    this.oniceconnectionstatechange?.();
    this.dispatchEvent(new MockEvent("iceconnectionstatechange"));
  }

  /** Set connection state and fire the callback */
  setConnectionState(state: RTCPeerConnectionState): void {
    this._connectionState = state;
    this.connectionState = state;
    this.onconnectionstatechange?.();
    this.dispatchEvent(new MockEvent("connectionstatechange"));
  }

  /** Simulate receiving a data channel from the remote side */
  simulateDataChannel(channel: MockRTCDataChannel = new MockRTCDataChannel()): void {
    this.ondatachannel?.({ channel } as any);
  }

  async createOffer(options?: RTCOfferOptions): Promise<RTCSessionDescriptionInit> {
    return {
      type: "offer",
      sdp: "v=0\no=- 0 0 IN IP4 127.0.0.1\ns=mock-offer\n",
    };
  }

  async createAnswer(options?: RTCAnswerOptions): Promise<RTCSessionDescriptionInit> {
    return {
      type: "answer",
      sdp: "v=0\no=- 0 0 IN IP4 127.0.0.1\ns=mock-answer\n",
    };
  }

  async setLocalDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = new MockRTCSessionDescription(desc);
    if (desc.type === "offer") {
      // Simulate ICE candidate gathering
      setTimeout(() => {
        this.onicecandidate?.({
          candidate: null,
        } as any);
      }, 50);
    }
  }

  async setRemoteDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescription = new MockRTCSessionDescription(desc);
  }

  async addIceCandidate(candidate?: RTCIceCandidateInit): Promise<void> {
    // no-op in mock
  }

  createDataChannel(label: string, options?: RTCDataChannelInit): RTCDataChannel {
    const dc = new MockRTCDataChannel(label);
    this.createdChannels.push(dc);
    // Auto-open the data channel after creation
    setTimeout(() => {
      (dc as MockRTCDataChannel).readyState = "open";
    }, 10);
    return dc as unknown as RTCDataChannel;
  }

  close(): void {
    this.setConnectionState("closed");
    for (const dc of this.createdChannels) {
      dc.close();
    }
  }

  // ── EventTarget ──

  addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: AddEventListenerOptions | boolean,
  ): void {
    if (!callback) return;
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(callback);
  }

  removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: EventListenerOptions | boolean,
  ): void {
    if (!callback) return;
    this.listeners.get(type)?.delete(callback);
  }

  dispatchEvent(event: Event): boolean {
    const handlers = this.listeners.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        if (typeof handler === "function") {
          handler(event);
        } else {
          handler.handleEvent(event);
        }
      }
    }
    return true;
  }

  // ── Unimplemented stubs ──

  getTransceivers(): RTCRtpTransceiver[] { return []; }
  getSenders(): RTCRtpSender[] { return []; }
  getReceivers(): RTCRtpReceiver[] { return []; }
  addTrack(track: MediaStreamTrack, ...streams: MediaStream[]): RTCRtpSender {
    throw new Error("Not implemented in mock");
  }
  removeTrack(sender: RTCRtpSender): void {}
  addTransceiver(trackOrKind: MediaStreamTrack | string, init?: RTCRtpTransceiverInit): RTCRtpTransceiver {
    throw new Error("Not implemented in mock");
  }
  getStats(): Promise<RTCStatsReport> {
    return Promise.resolve(new Map() as any);
  }
  restartIce(): void {}
  getConfiguration(): RTCConfiguration { return this.config ?? {}; }
  setConfiguration(config?: RTCConfiguration): void {}
  addStream(stream: MediaStream): void {}
  removeStream(stream: MediaStream): void {}
}

// ── Install WebRTC mocks on globalThis ───────────────────────────────

(globalThis as any).RTCPeerConnection = MockRTCPeerConnection;
(globalThis as any).RTCSessionDescription = MockRTCSessionDescription;
(globalThis as any).RTCIceCandidate = MockRTCIceCandidate;

// ── Ensure crypto.subtle is available ───────────────────────────────

// Node.js ≥ 19 has globalThis.crypto with subtle
// vitest in Node.js should have it. If not, we'd need a polyfill,
// but node:crypto's webcrypto exposes subtle.
// If running on an older Node, install via: `npm install -D webcrypto`
if (typeof globalThis.crypto === "undefined") {
  // Fallback — use Node's built-in webcrypto
  const webcrypto = require("node:crypto").webcrypto;
  (globalThis as any).crypto = webcrypto;
} else if (typeof (globalThis as any).crypto.subtle === "undefined") {
  // Polymerize: some Node versions expose crypto but not subtle
  const { webcrypto } = require("node:crypto");
  (globalThis as any).crypto = webcrypto;
}
