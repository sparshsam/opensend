# OpenSend WebRTC Tests

This directory contains test fixtures and setup for testing OpenSend's WebRTC engine (`src/lib/webrtc/webrtc-engine.ts`).

## Prerequisites

- Node.js ≥ 18 (tested with Node 20+)
- Install vitest as a dev dependency:

```bash
cd /home/spars/repos/opensend
npm install -D vitest @types/node
```

## Files

| File | Purpose |
|------|---------|
| `setup.ts` | Global test setup: polyfills DOM, Blob, URL, and WebRTC APIs (`RTCPeerConnection`, `RTCDataChannel`, `RTCSessionDescription`, `RTCIceCandidate`) in Node.js |
| `webrtc-fixtures.ts` | Typed fixture helpers for 6 transfer scenarios |
| `README.md` | This file |

## Fixture Scenarios

All fixtures live in `webrtc-fixtures.ts` and can be imported as:

```ts
import {
  createFile,
  createFiles,
  buildTransferMetadata,
  buildBadChecksumMetadata,
  buildExpiredSession,
  buildDuplicateReceiverJoinSignals,
  buildCloudUploadResponse,
  buildSession,
  buildBatchMetadata,
  buildSignal,
  buildProgress,
  KNOWN_CONTENT,
  KNOWN_CHECKSUMS,
  BAD_CHECKSUM,
  TEST_SESSION_ID,
  // ... and more
} from "../tests/webrtc-fixtures";
```

### 1. Single file transfer
```ts
const file = createFile("photo.jpg", "SMALL", "image/jpeg");
const meta = buildTransferMetadata("photo.jpg", "SMALL", "image/jpeg");
// meta.checksum === KNOWN_CHECKSUMS.SMALL
```

### 2. Multi-file transfer
```ts
const files = createFiles(5, "MEDIUM", "video");  // 5 files
const batchMeta = buildBatchMetadata(5, "MEDIUM", "video");
```

### 3. Bad checksum
```ts
const badMeta = buildBadChecksumMetadata("tampered.bin");
// badMeta.checksum === BAD_CHECKSUM (all zeros)
client expects different checksum
```

### 4. Expired code
```ts
const expired = buildExpiredSession();
// expired.status === "expired"
// expired.expired_at is in the past
```

### 5. Duplicate receiver join
```ts
const [sig1, sig2] = buildDuplicateReceiverJoinSignals();
// sig1 and sig2 are identical "receiver-joined" signals
```

### 6. Cloud fallback
```ts
const uploadOk = buildCloudUploadResponse({ claimCode: "MY-CODE" });
// uploadOk.success === true, uploadOk.downloadUrl contains claimCode

const uploadFail = buildCloudUploadError("Storage full");
// uploadFail.success === false, uploadFail.error === "Storage full"
```

## Writing Tests

Create test files in `tests/` with the `.test.ts` extension:

```ts
// tests/webrtc-engine.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { WebRTCEngine } from "@/lib/webrtc/webrtc-engine";
import {
  createFile,
  buildTransferMetadata,
  buildBadChecksumMetadata,
  KNOWN_CONTENT,
  KNOWN_CHECKSUMS,
} from "./webrtc-fixtures";

describe("WebRTCEngine", () => {
  it("should compute correct checksum for known content", async () => {
    const { computeSHA256 } = await import("@/lib/webrtc/webrtc-engine");
    const hash = await computeSHA256(KNOWN_CONTENT.SMALL);
    expect(hash).toBe(KNOWN_CHECKSUMS.SMALL);
  });
});
```

## Running Tests

### Single run
```bash
npm test
```

### Watch mode
```bash
npm run test:watch
```

### With coverage
```bash
npm run test:coverage
```

### vitest config

Add to `vitest.config.ts` (create if not exists):

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    setupFiles: ["./tests/setup.ts"],
    environment: "node",        // We polyfill DOM ourselves
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

Or add to `package.json`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

## Mocks

The `setup.ts` file provides:

- **`MockRTCPeerConnection`** — configurable ICE/connection state transitions, simulates `createOffer`, `createAnswer`, ICE candidate gathering, and data channel creation
- **`MockRTCDataChannel`** — configurable `readyState`, `bufferedAmount` tracking (for backpressure tests), `drain()` method to simulate bufferedamountlow, `receiveMessage()` to simulate incoming data
- **`MockRTCSessionDescription`** / **`MockRTCIceCandidate`** — lightweight wrappers matching the browser API shape

All mocks implement `EventTarget` so the engine's `addEventListener` patterns work without modification.

## Notes

- `setup.ts` is loaded automatically via `setupFiles` in the vitest config.
- The DOM polyfill is intentionally minimal — only what the engine needs (`document.createElement`, `URL.createObjectURL`, `Blob`).
- For integration tests involving the signaling API, mock `fetch` using `vi.fn()`.
