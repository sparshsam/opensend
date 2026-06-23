# OpenSend WebRTC Architecture v0.2.1

## Overview

OpenSend uses WebRTC for direct device-to-device file transfer. Supabase Realtime handles signaling (session negotiation), while data flows directly between peers via encrypted UDP/TCP connections.

## Transfer Paths

```
Primary:   Device A ←──WebRTC P2P──→ Device B
Fallback:  Device A ←──Relay──→ OpenSend ←──Relay──→ Device B
```

The relay path (Supabase Storage) remains as a fallback when direct P2P cannot be established (e.g., symmetric NAT).

## Architecture

```
┌──────────────────────┐     Supabase Realtime      ┌──────────────────────┐
│   Device A (Sender)  │◄──── (broadcast channel) ──►│  Device B (Receiver) │
│                      │     offer/answer/ICE        │                      │
│  WebRTCEngine        │                            │  WebRTCEngine        │
│  ┌──────────────┐    │     WebRTC DataChannel      │  ┌──────────────┐    │
│  │ DataChannel  │────┼─────────────────────────────┼──│ DataChannel  │    │
│  └──────────────┘    │    (binary chunks)          │  └──────────────┘    │
│                      │                            │                      │
│  SHA-256 checksum ───┼─────────────────────────────┼──▶ Verify + Save    │
└──────────────────────┘                            └──────────────────────┘
```

## Signaling Flow

1. **Session Created** — Sender POSTs to `/api/sessions`, creates `opensend_transfer_sessions` row
2. **Channel Join** — Both devices subscribe to Realtime channel `opensend-signal-{sessionId}`
3. **Offer** — Sender creates RTCPeerConnection, generates offer, broadcasts via Realtime
4. **Answer** — Receiver sets remote description, creates answer, broadcasts back
5. **ICE** — Both sides exchange ICE candidates via Realtime as they're discovered
6. **Connected** — DataChannel `onopen` fires, transfer begins
7. **Metadata** — Sender sends file metadata (name, size, type, checksum)
8. **Chunks** — File sent in 16KB chunks over the DataChannel
9. **Verify** — Sender sends SHA-256 checksum, receiver validates
10. **Complete** — Session marked complete, file saved to downloads

## ICE Servers

```javascript
{
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ]
}
```

STUN works for most NAT configurations. TURN servers can be added for symmetric NAT — configure in the ICE_SERVERS constant in `webrtc-engine.ts`.

## Connection Types

| Type | When Used | Characteristics |
|------|-----------|-----------------|
| Direct (P2P) | STUN succeeds | Low latency, no bandwidth limit |
| Relay | STUN fails, TURN configured | Higher latency, server bandwidth costs |

## DataChannel Configuration

- **Label:** `filedata`
- **Ordered:** `true` (files need ordering)
- **Chunk size:** 16KB (standard WebRTC message size)
- **Binary type:** `arraybuffer`

## Transfer Lifecycle

```
Sender                              Receiver
  │                                    │
  ├─ POST /api/sessions ──────────────►│
  │◄─ session created ────────────────┤
  │                                    │
  ├─ Join Realtime channel ───────────►│
  │◄─ Join Realtime channel ──────────┤
  │                                    │
  ├─ Create offer ───── broadcast ────►│
  │◄─ Create answer ─── broadcast ────┤
  │◄── ICE candidates ── broadcast ───►│
  │                                    │
  │──── DataChannel connected ──────── │
  │                                    │
  ├─ Send metadata (JSON) ───────────►│
  │◄─ metadata-ack ───────────────────┤
  │                                    │
  ├─ Send chunks (binary) ───────────►│
  │  (16KB each, with progress)       │  progress updated
  │                                    │
  ├─ Send checksum (JSON) ───────────►│
  │                                    ├─ Verify SHA-256
  │◄─ checksum-ok ────────────────────┤
  │                                    ├─ Save file
  │                                    ├─ Trigger download
  │                                    │
  ├─ PATCH session → completed ──────►│
```

## Transfer States

```
idle → negotiating → transferring → verifying → completed
                                      → cancelled
                                      → error
```

## Chunked Transfer

Files are sent in 16KB chunks to avoid hitting WebRTC message size limits:

```
File: [ chunk 1 | chunk 2 | chunk 3 | ... | chunk N ]
        16KB      16KB      16KB              ≤16KB
```

Progress is computed on both sides:
- Sender: tracks bytes sent
- Receiver: tracks bytes received

Speed is calculated as a rolling average over 200ms windows.

## Checksum Verification

SHA-256 checksum is computed on the sender before transfer and sent after all chunks. The receiver recomputes the hash from received data and compares:

```
match  → "checksum-ok"  → file saved, session completed
mismatch → "checksum-fail" → file discarded, session marked error
```

## Device Heartbeat

Devices announce online status via a Supabase Realtime presence channel:

- Channel: `opensend-devices`
- Presence key: device ID
- Heartbeat interval: 30 seconds
- Detection timeout: 60 seconds (device considered offline if no heartbeat seen)

## Limitations (v0.2.1)

| Limitation | Impact | Future |
|-----------|--------|--------|
| Same-account only | Cannot transfer between different user accounts | Friend-to-friend |
| No TURN | Falls back to relay (Supabase Storage) if STUN fails | Configure TURN servers |
| No E2EE | Data encrypted in transit via DTLS, but servers could theoretically intercept | Full E2EE with key exchange |
| No resume | Failed transfers must be re-sent from scratch | Chunk-level resume |
| Single file per transfer | No batch/multi-file | Multi-file queue |
