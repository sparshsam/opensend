# OpenSend v0.2.8 — CLAUDE.md

## Project
Repository at `/home/spars/repos/opensend/`.  
Deployed at **https://opensendbysparsh.vercel.app**  
Contact: **sparshsam@gmail.com**

## Current State
v0.2.8 — Download Prompt + Completion State Fix

## Key Facts
- **Pages:** `/` (clean homepage), `/send` (send flow), `/receive` (receive flow + auto-join from URL params), `/t/[code]` (cloud download)
- **Two transfer methods:** Direct Transfer (WebRTC P2P), Cloud Transfer (temporary upload/download)
- **Bluetooth:** disabled (`supported: false`), shows "Coming later for native apps."
- **Guest transfers:** HTTP polling signaling (`PollSignaling`) — no Supabase dependency
- **WebRTC Engine:** `WebRTCEngine` with `_transferCompleted` flag — prevents connection-close-after-completion from overwriting state
- **Checksum handshake:** Receiver sends `checksum-ok` / `checksum-fail` over DataChannel after verifying SHA-256
- **QR:** Encodes URL (`/receive?code=CODE&session=UUID`) — opens receive page with auto-join
- **Auto-join:** `/receive?code=&session=` pre-fills code + validates + joins automatically
- **Download:** Blob with 10s URL lifetime, anchor appended to DOM, forced `download` attribute
- **Mobile:** Bottom nav bar (Transfer, History, Diagnostics, Profile) with icons; iOS safe area
- **Diagnostics:** Copy diagnostics button on failed states — includes session ID, code, role, state, completed flag, bytes sent/expected
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
8. `handleDataChannelMessage` must handle: `metadata`, `checksum`, `checksum-ok`, `checksum-fail`, `cancel`
9. `_transferCompleted` must be set before the connection state handler fires after a completed transfer

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
  select file                   scan QR / enter code
  create session                look up session
  show QR + code                join with transfer_code
  poll for receiver             send "receiver-joined" signal
  create WebRTC offer           poll for offer
  forward answer/ICE to engine  accept connection (answer)
  send chunks                   receive chunks + ack
  send checksum                 verify SHA-256
  receive "checksum-ok"         send "checksum-ok"
  → COMPLETED                   trigger download → COMPLETED
```

## State Machine
**Sender:** `select-file → creating → waiting → receiver-joined → connecting → sending-file → verifying → completed`
- `failed` only if connection drops before `_transferCompleted` is set

**Receiver:** `idle → looking-up → joining → connected → waiting-for-sender → receiving-file → verifying → completed`
- `failed` only if connection drops or join fails

## Diagnostics
When transfer fails, click "Copy diagnostics" to clipboard:
```
=== OpenSend Diagnostics ===
Session: uuid
Code: XXXXXX
Role: sender
State: failed
Completed: false
Bytes sent: 756462 / 756462
Signaling: verifying
ICE: connected
DataChannel: open
Last signal: ice-candidate
Last error: Connection lost during transfer.
============================
```

## Manual Test Checklist
1. QR scan → opens receive page → auto-joins
2. Manual code entry → same result
3. Sender shows "Sent successfully" when checksum confirmed
4. Receiver shows "Downloaded successfully" after download
5. Invalid code shows clear error
6. Expired code shows clear error
7. Mobile nav appears on small screens
8. Download prompts (not inline preview) for PDF/images/text
