# Guest Connectivity Audit v0.2.4

## Current State

OpenSend v0.2.3 introduced guest transfer sessions but left a critical dependency:

**Guest transfers depend on Supabase Realtime for WebRTC signaling.**

Supabase Realtime requires credentials (URL + anon key) that are embedded in the client. While the anon key is public, guest users in a browser without Supabase SDK loaded cannot establish Realtime channels.

## Dependency Analysis

| Component | Supabase Auth? | Account Required? | Guest Works? |
|-----------|---------------|-------------------|--------------|
| Guest session creation | No | No | ✅ `opensend_guest_sessions` table (no user_id) |
| Guest session lookup | No | No | ✅ Public select by transfer_code |
| Pair code generation | No | No | ✅ Client-side random generation |
| Ephemeral names | No | No | ✅ Client-side adjective+noun |
| **WebRTC signaling** | **Yes** | **Implicit** | **❌ Requires Supabase Realtime** |
| Transfer history | No | No | ✅ LocalStorage (guest) or Supabase (signed-in) |
| Device discovery | Yes | Yes | ✅ Only for signed-in users |
| MCP tools | Yes | Yes | ✅ Only for signed-in users |

## Critical Finding

**WebRTC signaling for guest transfers uses Supabase Realtime broadcast channels.**

The `SignalingService` class in `src/lib/webrtc/signaling.ts` creates a Supabase Realtime channel for every transfer session. Guest users without the Supabase client loaded cannot join these channels.

## Root Cause

The Supabase Realtime client (`@supabase/supabase-js`) requires:
1. `NEXT_PUBLIC_SUPABASE_URL` — available in client bundle
2. `NEXT_PUBLIC_SUPABASE_ANON_KEY` — available in client bundle

While these ARE available in the client, the `createBrowserClient` function in `src/lib/supabase/client.ts` reads from `process.env.NEXT_PUBLIC_*` which may not resolve correctly in all guest scenarios. Additionally, relying on Supabase infrastructure for guest signaling creates an unnecessary external dependency.

## Solution

**Replace Supabase Realtime signaling with HTTP polling-based signaling for guest sessions.**

Guest signaling flow:
1. Sender POSTs signal messages to `/api/guest/signal`
2. Receiver GETs signal messages from `/api/guest/signal`
3. Both sides poll every 500ms during negotiation
4. No WebSocket, no realtime channel, no Supabase dependency

This requires a new table: `opensend_guest_signals` for temporary message storage.

## Guest Signaling Architecture

```
Sender                        Receiver
  │                              │
  ├─ POST /api/guest/sessions ──►│  create session
  │◄─ {code, secret} ───────────┤
  │                              │
  ├─ POST /api/guest/signal ────►│  send offer
  │  {type:"offer", payload}     │
  │                              │
  │◄─ GET /api/guest/signal ─────┤  poll for messages
  │  ← [{type:"answer",...}]     │
  │                              │
  ├─ POST /api/guest/signal ────►│  send ICE candidates
  │                              │
  │◄─ GET /api/guest/signal ─────┤  poll for ICE candidates
  │                              │
  │──── DataChannel connected ── │
  │                              │
  ├─ Send file chunks ──────────►│  direct P2P (no signaling needed)
```

## Other Findings

1. Guest history uses localStorage — no server dependency. ✅
2. Ephemeral names are client-generated — no server dependency. ✅
3. Pair codes use `opensend_guest_sessions` — server dependency but no auth. ✅
4. Transfer approval UI is client-side — no server dependency. ✅

## Recommendation

Implement HTTP polling signaling for all guest transfers.
Keep Supabase Realtime for signed-in user transfers (lower latency, real-time).
