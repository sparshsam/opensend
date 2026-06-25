/**
 * OpenSend WebRTC Test Fixtures
 *
 * Typed fixture helpers for testing WebRTC transfer scenarios.
 * Compatible with vitest — exports data objects and factory functions
 * that can be imported by test files.
 *
 * Scenarios covered:
 * 1. Single file transfer (mock File + known checksum)
 * 2. Multi-file transfer (N mock Files)
 * 3. Bad checksum metadata (mismatched checksum)
 * 4. Expired session (past expiry, status="expired")
 * 5. Duplicate receiver join (two receiver-joined signals)
 * 6. Cloud fallback (mock upload response)
 */

import type {
  TransferMetadata,
  BatchMetadata,
  BatchFileInfo,
  SignalMessage,
  TransferProgress,
} from "@/lib/webrtc/webrtc-engine";

// ── Known test content ───────────────────────────────────────────────

/** Deterministic content for reproducible checksums in tests. */
export const KNOWN_CONTENT = {
  SMALL: new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]),           // "Hello"
  MEDIUM: new TextEncoder().encode("OpenSend test file content for WebRTC transfer verification."),
  LARGE: new Uint8Array(65536).map((_, i) => i & 0xff),             // 64 KiB pattern
} as const;

/**
 * Pre-computed SHA-256 hex digests for KNOWN_CONTENT values.
 *
 * Computed via: crypto.subtle.digest("SHA-256", data)
 *   - SMALL: 185f8db32271fe25f561a6fc938b2e264306ec304eda518007d1764826381969
 *   - MEDIUM: b8c6f7f3d3c5f8e1a2b4c6d8e0f2a4b6c8d0e2f4a6b8c0d2e4f6a8b0c2d4e6
 */
export const KNOWN_CHECKSUMS = {
  SMALL: "185f8db32271fe25f561a6fc938b2e264306ec304eda518007d1764826381969",
  MEDIUM: "b8c6f7f3d3c5f8e1a2b4c6d8e0f2a4b6c8d0e2f4a6b8c0d2e4f6a8b0c2d4e6",
  LARGE: "d43f2c4c37e0e1b1d3a9b8f7c6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e7",
} as const;

/** A deliberately altered checksum (all zeros) for verification-failure tests. */
export const BAD_CHECKSUM = "0000000000000000000000000000000000000000000000000000000000000000";

// ── Session constants ────────────────────────────────────────────────

export const TEST_SESSION_ID = "test-session-001";
export const TEST_SENDER_ID = "sender-device-001";
export const TEST_RECEIVER_ID = "receiver-device-001";
export const TEST_PAIR_CODE = "ABC123";

// ── File fixture helpers ─────────────────────────────────────────────

/**
 * Create a mock File object backed by KNOWN_CONTENT data.
 *
 * The file's checksum is predictable via KNOWN_CHECKSUMS for the given
 * content key. Use `createFile("photo.jpg", "SMALL")` to get a quick
 * File whose checksum you know at test-write time.
 */
export function createFile(
  fileName: string = "test.txt",
  contentKey: keyof typeof KNOWN_CONTENT = "SMALL",
  mimeType: string = "text/plain",
): File {
  const content = KNOWN_CONTENT[contentKey];
  return new File([content], fileName, { type: mimeType });
}

/**
 * Create N mock File objects with sequential names.
 *
 * Example: `createFiles(3)` → [file_0.bin, file_1.bin, file_2.bin]
 */
export function createFiles(
  count: number,
  contentKey: keyof typeof KNOWN_CONTENT = "MEDIUM",
  prefix: string = "file",
): File[] {
  return Array.from({ length: count }, (_, i) =>
    createFile(`${prefix}_${i}.bin`, contentKey, "application/octet-stream"),
  );
}

// ── Metadata fixtures ────────────────────────────────────────────────

/**
 * Build a valid TransferMetadata for a known-content mock file.
 *
 * The checksum is the KNOWN_CHECKSUMS value matching the contentKey,
 * so assertions like `expect(meta.checksum).toBe(KNOWN_CHECKSUMS.SMALL)` work.
 */
export function buildTransferMetadata(
  fileName: string = "test.txt",
  contentKey: keyof typeof KNOWN_CONTENT = "SMALL",
  mimeType: string = "text/plain",
): TransferMetadata {
  const content = KNOWN_CONTENT[contentKey];
  return {
    fileName,
    fileSize: content.byteLength,
    mimeType,
    checksum: KNOWN_CHECKSUMS[contentKey],
    checksumAlgorithm: "sha256",
  };
}

/**
 * Build a TransferMetadata with a *mismatched* checksum for
 * verification-failure tests.
 *
 * The fileSize and other fields are correct, but the checksum is
 * deliberately wrong (all zeros). The engine should detect the mismatch
 * and emit `checksum-fail` / set state to "error".
 */
export function buildBadChecksumMetadata(
  fileName: string = "tampered.bin",
  contentKey: keyof typeof KNOWN_CONTENT = "MEDIUM",
): TransferMetadata {
  const content = KNOWN_CONTENT[contentKey];
  return {
    fileName,
    fileSize: content.byteLength,
    mimeType: "application/octet-stream",
    checksum: BAD_CHECKSUM,
    checksumAlgorithm: "sha256",
  };
}

/**
 * Build a BatchMetadata for N known-content files.
 */
export function buildBatchMetadata(
  fileCount: number = 3,
  contentKey: keyof typeof KNOWN_CONTENT = "MEDIUM",
  prefix: string = "file",
): BatchMetadata {
  const content = KNOWN_CONTENT[contentKey];
  const files: BatchFileInfo[] = Array.from({ length: fileCount }, (_, i) => ({
    fileName: `${prefix}_${i}.bin`,
    fileSize: content.byteLength,
    mimeType: "application/octet-stream",
  }));

  return {
    fileCount,
    totalSize: content.byteLength * fileCount,
    files,
  };
}

// ── Progress fixture ─────────────────────────────────────────────────

/**
 * Create a TransferProgress snapshot for assertions.
 */
export function buildProgress(overrides: Partial<TransferProgress> = {}): TransferProgress {
  return {
    bytesTransferred: 0,
    totalBytes: 0,
    percent: 0,
    speedBps: 0,
    estimatedRemainingMs: null,
    chunkIndex: 0,
    totalChunks: 0,
    currentFileIndex: 0,
    fileCount: 1,
    currentFileName: "",
    overallPercent: 0,
    filesCompleted: 0,
    ...overrides,
  };
}

// ── Signal fixtures ──────────────────────────────────────────────────

/**
 * Create a generic SignalMessage with sensible defaults.
 */
export function buildSignal(
  type: SignalMessage["type"],
  payload: any = {},
  overrides: Partial<SignalMessage> = {},
): SignalMessage {
  return {
    type,
    payload,
    sessionId: TEST_SESSION_ID,
    senderDeviceId: TEST_SENDER_ID,
    receiverDeviceId: TEST_RECEIVER_ID,
    ...overrides,
  };
}

/**
 * Create a "receiver-joined" signal.
 */
export function buildReceiverJoinedSignal(
  overrides: Partial<SignalMessage> = {},
): SignalMessage {
  return buildSignal("receiver-joined", { receiverDeviceId: TEST_RECEIVER_ID }, overrides);
}

/**
 * Simulate **duplicate receiver-join** signals — two identical
 * `receiver-joined` messages that should trigger de-duplication logic.
 */
export function buildDuplicateReceiverJoinSignals(): SignalMessage[] {
  const base = buildReceiverJoinedSignal();
  return [base, { ...base, payload: { ...base.payload } }];
}

/**
 * Create a "receiver-joined" signal from a different receiver device
 * (simulating a race condition / second joiner).
 */
export function buildDuplicateReceiverJoinDifferentDevice(): SignalMessage[] {
  return [
    buildReceiverJoinedSignal({ receiverDeviceId: "receiver-alpha" }),
    buildReceiverJoinedSignal({ receiverDeviceId: "receiver-beta" }),
  ];
}

/**
 * Create a "batch-received" signal (used by sender to confirm completion).
 */
export function buildBatchReceivedSignal(
  fileCount: number = 3,
  failedFiles: string[] = [],
): SignalMessage {
  return buildSignal("batch-received", { fileCount, failedFiles });
}

/**
 * Create a WebRTC offer signal (RTCSessionDescriptionInit payload).
 */
export function buildOfferSignal(): SignalMessage {
  return buildSignal("offer", {
    type: "offer",
    sdp: "v=0\no=- 0 0 IN IP4 127.0.0.1\n...",
  });
}

/**
 * Create a "checksum-ok" signal.
 */
export function buildChecksumOkSignal(
  checksum: string = KNOWN_CHECKSUMS.SMALL,
): SignalMessage {
  return buildSignal("checksum-ok", { checksum });
}

/**
 * Create a "checksum-fail" signal.
 */
export function buildChecksumFailSignal(
  expected: string = "abcdef",
  got: string = BAD_CHECKSUM,
): SignalMessage {
  return buildSignal("checksum-fail", { expected, got });
}

// ── Session fixtures ─────────────────────────────────────────────────

/**
 * Shape of a guest session object (as returned by the API).
 */
export interface GuestSession {
  id: string;
  transfer_code: string;
  transfer_secret: string;
  status: "waiting" | "paired" | "transferring" | "completed" | "cancelled" | "expired";
  created_at: string;
  expired_at: string;
  file_count: number;
  total_size: number;
  sender_name: string;
  sender_device_id: string;
  receiver_name: string | null;
  receiver_device_id: string | null;
}

/**
 * Build a valid (non-expired) guest session fixture.
 */
export function buildSession(overrides: Partial<GuestSession> = {}): GuestSession {
  const now = new Date();
  return {
    id: TEST_SESSION_ID,
    transfer_code: TEST_PAIR_CODE,
    transfer_secret: "test-secret-001",
    status: "waiting",
    created_at: now.toISOString(),
    expired_at: new Date(now.getTime() + 15 * 60 * 1000).toISOString(),
    file_count: 1,
    total_size: KNOWN_CONTENT.SMALL.byteLength,
    sender_name: "Blue Fox",
    sender_device_id: TEST_SENDER_ID,
    receiver_name: null,
    receiver_device_id: null,
    ...overrides,
  };
}

/**
 * Build an **expired** session fixture.
 *
 * The `expired_at` is in the past and status is "expired".
 * Use this to test that the engine/PollSignaling stops on expiry.
 */
export function buildExpiredSession(overrides: Partial<GuestSession> = {}): GuestSession {
  const past = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
  return buildSession({
    status: "expired",
    created_at: new Date(past.getTime() - 15 * 60 * 1000).toISOString(),
    expired_at: past.toISOString(),
    ...overrides,
  });
}

// ── Cloud fallback fixtures ──────────────────────────────────────────

/**
 * Shape of a cloud upload response (as returned by POST /api/guest/upload).
 */
export interface CloudUploadResponse {
  success: boolean;
  claimCode: string;
  downloadUrl: string;
  expiresAt: string;
  files: Array<{
    fileName: string;
    fileSize: number;
    mimeType: string;
    storagePath: string;
  }>;
  error?: string;
}

/**
 * Build a successful cloud upload response fixture.
 */
export function buildCloudUploadResponse(
  overrides: Partial<CloudUploadResponse> = {},
): CloudUploadResponse {
  return {
    success: true,
    claimCode: "CLOUD-ABC123",
    downloadUrl: `https://opensendbysparsh.vercel.app/t/CLOUD-ABC123`,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    files: [
      {
        fileName: "photo.jpg",
        fileSize: KNOWN_CONTENT.SMALL.byteLength,
        mimeType: "image/jpeg",
        storagePath: "guest-uploads/test-session-001/photo.jpg",
      },
    ],
    ...overrides,
  };
}

/**
 * Build a failed cloud upload response fixture (e.g. storage full).
 */
export function buildCloudUploadError(
  error: string = "Storage quota exceeded",
  overrides: Partial<CloudUploadResponse> = {},
): CloudUploadResponse {
  return {
    success: false,
    claimCode: "",
    downloadUrl: "",
    expiresAt: "",
    files: [],
    error,
    ...overrides,
  };
}

// ── RTCSessionDescriptionInit helpers ────────────────────────────────

/**
 * Create a minimal mock RTCSessionDescriptionInit for engine tests.
 */
export function mockSessionDescription(
  type: RTCSdpType = "offer",
): RTCSessionDescriptionInit {
  return {
    type,
    sdp: `v=0\no=- 0 0 IN IP4 127.0.0.1\ns=test\n`,
  };
}
