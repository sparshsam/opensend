# OpenSend v0.2.13 — CLAUDE.md

## Project
Repository at `/home/spars/repos/opensend/`.  
Deployed at **https://opensendbysparsh.vercel.app**  
Contact: **sparshsam@gmail.com**

## Current State
v0.2.13 — iPhone Connection Fix + Download Polish

## Key Facts
- **Pages:** `/` (clean homepage), `/send` (send flow), `/receive` (receive flow + auto-join from URL params), `/t/[code]` (cloud download)
- **Two transfer methods:** Direct Transfer (WebRTC P2P), Cloud Transfer (temporary upload/download)
- **Bluetooth:** disabled (`supported: false`), shows "Coming later for native apps."
- **Guest transfers:** HTTP polling signaling (`PollSignaling`) — no Supabase dependency
- **Multi-file transfer:** Up to 20 files, max 50 MB each, max 500 MB total per session
- **Batch protocol:** `batch-metadata → (metadata → chunks → checksum → checksum-ok → file-complete)×N → batch-complete → batch-received`
- **Downloads:** Every file shown as `<a download>` link on completion page. Download All uses Web Share API (iOS) or sequential delayed anchor clicks (desktop). No auto-download.
- **iPhone → desktop:** Receiver MUST register `poll.onSignal(msg => engine.handleSignal(msg))` — iOS uses trickle ICE (separate candidates), Android bundles them in SDP
- **Chunk ack:** Persistent listener with `removeEventListener` cleanup (NOT `{ once: true }` — that caused slow transfers)
- **ICE disconnect:** "disconnected" state waits 5s before failing (may recover)
- **QR:** Encodes URL (`/receive?code=CODE&session=UUID`) — opens receive page with auto-join
- **Mobile:** Bottom nav bar (Transfer, History, Diagnostics, Profile) with icons; iOS safe area
- **Diagnostics:** Copy diagnostics on failed states — includes engine diagnostic log (ICE/DC/signaling steps)
- **Brand:** `#bc3fde` purple accent, dark bg `#1a0422`, light bg `#faf0ff`
- **Font:** Noto Sans Math (Regular 400 only)
- **DB:** All tables prefixed `opensend_` on shared Supabase project `rbdyrymtgfqqkdemicdo.supabase.co`
- **MCP:** 12 tools at `apps/mcp/`
- **Service role key:** Set in Vercel env vars + local `.env.local`

## Important Tailwind v4 Quirks
- `@theme inline {}` emits `:root { }` at the END of compiled CSS (overrides anything before it)
- Custom `@layer base` rules are STRIPPED — put body styles outside all `@layer` blocks
- Color utilities like `bg-bg-base` compile to **hardcoded RGB** at build time, not CSS variables
- Light mode overrides must use `.light` class selector on `<html>` at the bottom of `globals.css`

## Build
```bash
# Main project
npm install && npm run typecheck && npm run lint && npm run build

# MCP server
cd apps/mcp && npm install && npm run typecheck && npm test

# Deploy
npx vercel --prod --yes
```

## Critical Rules
1. Never modify OpenSprout tables — all OpenSend resources use `opensend_` prefix
2. Guest flows must never require auth — no `user_id`, no device registry dependency
3. Every signed-in Supabase query must filter by `user_id`
4. MCP tools must maintain strict user isolation per query
5. Do not claim real-world transfer success unless manually tested by Sparsh
6. Do not claim E2EE unless fully implemented
7. PATCH `/api/guest/sessions` accepts `transfer_code` for receiver join (limited to `receiver_name` + `status: "paired"`); full `transfer_secret` (UUID) required for all other updates
8. `handleDataChannelMessage` must handle: `batch-metadata`, `metadata`, `checksum`, `checksum-ok`, `checksum-fail`, `file-complete`, `batch-complete`, `batch-received`, `cancel`
9. `_transferCompleted` must be set before the connection state handler fires after a completed transfer
10. **Receiver must register `poll.onSignal(msg => engine.handleSignal(msg))`** before `poll.start()`

## Guest Session Lifecycle
```
created → waiting → paired → transferring → completed (final)
  |          |          |           |
  expired   expired   cancelled    failed
```
Session auto-expires after 15 minutes. Pair codes: 6 chars, `crypto.getRandomValues()`.

## Transfer Flow (Direct)
```
Sender:                        Receiver:
  select files                  scan QR / enter code
  create session                look up session
  show QR + code                join with transfer_code
  poll for receiver             send "receiver-joined" signal
  create WebRTC offer           poll for offer
  forward answer/ICE to engine  accept connection (answer)
  send batch-metadata           register poll.onSignal → engine
  (send chunks + ack)×N        receive + verify each file
  send checksum                 send checksum-ok
  send file-complete            advance file index
  send batch-complete           send batch-received (ack all files)
  → COMPLETED                   → show download links → COMPLETED
```

## State Machine
**Sender:** `select-files → creating → waiting → receiver-joined → connecting → sending-file → verifying → sending-next → completed`
- `failed` only if connection drops before `_transferCompleted` is set

**Receiver:** `idle → looking-up → joining → connected → waiting-for-sender → receiving-file → verifying → completed`
- `failed` only if connection drops or join fails
- Invalid/expired codes stay on `idle` with inline error

## WebRTC Engine Details
- **Chunk size:** 8KB (Safari compatible)
- **Backpressure:** Waits on `bufferedamountlow` when buffer > 1MB
- **File timeout:** 60s per file
- **Pacing:** 100ms between files
- **Message queue:** Serialized async processing — prevents race conditions
- **Diagnostics:** Every step logged to `diagLog[]` — accessible via `getDiagLog()`

## Manual Test Checklist
1. Send 1 file → completion shows download link
2. Send 5 files → all shown, Download All works
3. Desktop → iPhone (same WiFi) → transfers and downloads
4. iPhone → desktop (same WiFi) → transfers and downloads
5. Android → desktop → transfers and downloads
6. Invalid code → stays on entry, shows "Incorrect code"
7. Expired code → stays on entry, shows "expired"
8. Single file → download link appears (no auto-download)
