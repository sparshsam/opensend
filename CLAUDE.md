# OpenSend v0.3.4 — CLAUDE.md

## Project
Repository at `/home/spars/repos/opensend/`.  
Deployed at **https://send.kovina.org**  
Contact: **sparshsam@gmail.com**

## Current Release
v0.4.0 — Production Transfer Engine

## Key Facts
- **Pages:** `/` (clean homepage), `/send` (send flow), `/receive` (receive flow + auto-join from URL params), `/t/[code]` (cloud download), `/profile` (account info + MCP tokens + AI access)
- **Two transfer methods:** Direct Transfer (WebRTC P2P), Cloud Transfer (temporary upload/download)
- **Bluetooth:** disabled (`supported: false`), shows "Coming later for native apps."
- **Guest transfers:** HTTP polling signaling (`PollSignaling`) — no Supabase dependency
- **Multi-file transfer:** Up to 20 files, max 50 MB each, max 500 MB total per session
- **Batch protocol:** `batch-metadata → (metadata → chunks → checksum → checksum-ok → file-complete)×N → batch-complete → batch-received`
- **Resumable batch:** Failed files are skipped (1 retry per file), rest continue, failures reported in batch-complete
- **Downloads:** Every file shown as `<a download>` link on completion page. Download All uses Web Share API (iOS) or sequential delayed anchor clicks (desktop). No auto-download.
- **iPhone → desktop:** Receiver MUST register `poll.onSignal(msg => engine.handleSignal(msg))` — iOS uses trickle ICE (separate candidates), Android bundles them in SDP
- **Chunk ack:** Persistent listener with `removeEventListener` cleanup (NOT `{ once: true }` — that caused slow transfers)
- **ICE disconnect:** "disconnected" state waits 5s then attempts ICE restart (up to 2 reconnects) before failing
- **ICE restart:** `createOffer({ iceRestart: true })` on connection loss, up to 2 attempts with 2s delay
- **QR:** Encodes URL (`/receive?code=CODE&session=UUID`) — opens receive page with auto-join
- **Mobile:** Bottom nav bar with icons; iOS safe area via `viewport-fit=cover` + `pb-safe` utility
- **Diagnostics:** `getDiagnostics()` + `getBrowserDiagnostics()` — browser, platform, ICE state, failed files, reconnect attempts. Copy diagnostics on failed states.
- **Brand:** `#bc3fde` purple accent, dark bg `#1a0422`, light bg `#faf0ff`
- **Font:** Noto Sans Math (Regular 400 only)
- **Auth:** Google OAuth only (via Supabase). No GitHub.
- **Domain:** `send.kovina.org` (Cloudflare DNS → Vercel hosting)
- **DB:** All tables prefixed `opensend_` on shared Supabase project `rbdyrymtgfqqkdemicdo.supabase.co`
- **MCP:** 4 tools at `/api/mcp` (HTTP) + 14 tools at `apps/mcp/` (stdio)
- **Service role key:** Set in Vercel env vars + local `.env.local`

## MCP Server

**HTTP endpoint:** `POST https://send.kovina.org/api/mcp` with `Authorization: Bearer *** *
- 4 tools: `lookup_guest_session`, `lookup_transfer_by_code`, `list_my_transfers`, `describe_server`
- Token management: `GET/POST /api/mcp/tokens` (create/list), `DELETE /api/mcp/tokens/[id]` (revoke)
- Profile page has inline token management + AI Access info

**Stdio server:** `apps/mcp/` — 14 tools total
- **Transfers:** `list_my_transfers`, `get_transfer`, `delete_transfer`, `export_transfer_history`
- **Devices:** `list_my_devices`, `get_device`, `rename_device`, `list_transfer_history`,
  `list_transfer_sessions`, `get_transfer_session`, `list_online_devices`, `get_device_status`
- **Guest sessions:** `create_guest_session`, `get_guest_session`, `get_transfer_by_claim_code`

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
11. `/api/mcp` route handles JSON-RPC directly — no SDK transport dependency
12. Google OAuth uses explicit `redirectTo: window.location.origin + "/auth/callback"` in `signInWithOAuth`
13. Auth callback at `/auth/callback` exchanges code server-side, falls through to `/profile` on failure (browser client recovers session from cookies)

## Guest Session Lifecycle
```
created → waiting → paired → transferring → completed (final)
  |          |          |           |
  expired   expired   cancelled    failed
```
Session auto-expires after 15 minutes. Pair codes: 6 chars, `crypto.getRandomValues()`.
Rate limited: 5 sessions/min per IP.

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
  (retry failed file)×1        (skip failed file)
  send batch-complete            send batch-received (ack all files)
  → COMPLETED                   → show download links → COMPLETED
```

## State Machine
**Sender:** `select-files → creating → waiting → receiver-joined → connecting → sending-file → verifying → sending-next → completed`
- `failed` only if connection drops after max reconnect attempts (2)

**Receiver:** `idle → looking-up → joining → connected → waiting-for-sender → receiving-file → verifying → completed`
- `failed` only if connection drops or join fails
- Invalid/expired codes stay on `idle` with inline error

## WebRTC Engine Details
- **Chunk size:** 8KB (Safari compatible)
- **Backpressure:** Waits on `bufferedamountlow` when buffer > 1MB
- **File timeout:** 120s per file (doubled from 60s for large files)
- **File retry:** 1 retry per failed file before skipping in batch
- **Pacing:** 100ms between files
- **ICE restart:** `createOffer({ iceRestart: true })` on failure, up to 2 attempts
- **Message queue:** Serialized async processing — prevents race conditions
- **Diagnostics:** `getDiagnostics()` returns full state (ICE, DC, reconnect attempts, failed files)

## API Validation & Rate Limiting
- **Shared validator** at `src/lib/api-validation.ts` — `validateString`, `validateNumeric`, `sanitizeString`, `validateUUID`, `validateTransferCode`, `checkRateLimit`
- **Rate limit:** 5 sessions/min/IP on `POST /api/guest/sessions`, returns `429 Retry-After`
- **Message types validated** against allowed list on signal POST
- **MIME types validated** against allowlist on guest upload

## Test Fixtures
Located at `tests/`:
- `webrtc-fixtures.ts` — 6 scenario helpers (single file, multi-file, bad checksum, expired code, duplicate receiver join, cloud fallback)
- `setup.ts` — Full mock DOM + MockRTCPeerConnection + MockRTCDataChannel polyfills
- `README.md` — Setup guide and API reference

## Manual Test Checklist
1. Send 1 file → completion shows receipt with verified status
2. Send 5 files (1 fails) → rest complete, failure reported
3. Desktop → iPhone (same WiFi) → transfers and downloads
4. iPhone → desktop (same WiFi) → transfers and downloads
5. Android → desktop → transfers and downloads
6. Invalid code → stays on entry, shows "Incorrect code"
7. Expired code → stays on entry, shows "expired"
8. Single file → download link appears (no auto-download)
9. Sign in with Google → redirects to /profile
10. Create MCP token → copy → use with agent
