# OpenSend Project Context for AI Agents

## Project
OpenSend — Free, ad-free, open-source file sharing. Direct device-to-device transfers. No account required.

**Deployment:** https://opensendbysparsh.vercel.app
**GitHub:** https://github.com/sparshsam/opensend
**Contact:** sparshsam@gmail.com

## Stack
- Next.js 15 (App Router) + TypeScript + Tailwind CSS 4
- Supabase (Postgres, Auth, Storage, Realtime)
- Vercel (deployment)
- WebRTC (device-to-device P2P transfers)
- MCP SDK (@modelcontextprotocol/sdk) — AI agent integration
- qrcode (QR code generation on canvas)

## Version History

| Version | Focus |
|---------|-------|
| v0.1.1 | Initial release: upload-to-cloud file sharing |
| v0.1.2 | Supabase backend wiring, professional setup |
| v0.2.0 | Device system, P2P architecture foundation |
| v0.2.1 | WebRTC engine, Supabase Realtime signaling |
| v0.2.2 | Guest-first UX, dark/light theme, diagnostics |
| v0.2.3 | True guest-to-guest transfers, pair codes |
| v0.2.4 | HTTP polling signaling (no Supabase dependency for guests) |
| v0.2.5 | Transfer methods (Wi-Fi/Bluetooth/Cloud), guest flow wiring |
| v0.2.6 | **UX Cleanup + Pairing Fix** — dedicated /send and /receive pages, QR component, transfer method rename, homepage cleanup, guest upload endpoint, pairing secret model fix |
| v0.2.7 | **QR Link Fix + Direct Transfer Handoff** — QR encodes URL (not JSON), auto-join from URL params, WebRTC signal forwarding fix, mobile bottom nav, iOS safe area, status text cleanup, diagnostics button |
| v0.2.8 | **Download Prompt + Completion State Fix** — download prompt with delayed URL revoke, `checksum-ok`/`checksum-fail` handlers in engine, `_transferCompleted` flag prevents connection-close-overwrites-completed, ICE tracking fix |
| v0.2.9 | **Multi-File Transfer** — batch protocol, up to 20 files, dual progress bars, per-file checksums |
| v0.2.10 | **Session Creation Fix** — `file_count`/`total_size`/`transfer_type` columns, API validation, error surfacing |
| v0.2.11 | **Reliability + Completion Truth** — `batch-received` signal, 8KB chunks, bufferedAmount backpressure, per-file timeout, Safari compatibility, message queue |
| v0.2.12 | **Batch Integrity + iPhone Picker** — serialized message queue fixes race conditions, `<label>` file picker for iOS, cursor pointers |
| v0.2.13 | **iPhone Connection Fix + Download Polish** — receiver `poll.onSignal` handler for ICE candidates, persistent chunk ack listener, `application/octet-stream` blob URLs, Download All with delays, no auto-download (always manual links), back-to-home buttons |

## Architecture

### Pages
- `/` — Clean homepage with Send and Receive cards only (no method selector, no enter-code on homepage)
- `/send` — Dedicated send flow: method + file selection → large QR + pair code → status states → transfer
- `/receive` — Dedicated receive flow: QR scan info + pair code entry (auto-joins from `?code=&session=` URL params)
- `/t/[code]` — Download page for Cloud Transfer claim codes

### Transfer Methods
1. **Direct Transfer** (primary) — WebRTC P2P via STUN/TURN. QR encodes receive page URL with params.
2. **Bluetooth** (disabled) — Always `supported: false`. Shows "Coming later for native apps."
3. **Cloud Transfer** (fallback) — Supabase Storage upload/download via `/api/guest/upload`. QR shows download URL.

### Signaling
- **Guest transfers:** HTTP polling (`PollSignaling`) — no auth, no WebSocket. Both parties poll `/api/guest/signal` every 500ms.
- **Account transfers:** Supabase Realtime (`SignalingService`) — requires login.

### Guest Transfer Lifecycle
```
created → waiting → paired → transferring → completed
  ↓          ↓          ↓           ↓
  expired   expired   cancelled    failed
```

Statuses enforced server-side on `opensend_guest_sessions`:
- `waiting` — sender created session, awaiting receiver
- `paired` — receiver joined
- `transferring` — WebRTC data channel open, chunks flowing
- `completed` — checksum verified, file saved
- `cancelled` — either side cancelled
- `expired` — 15-minute TTL reached

### Sender State Machine (v0.2.9 — Multi-File)
```
select-files → creating → waiting → receiver-joined → connecting → sending-file → verifying_file → sending_next → completed (final)
                                                                                             → failed (if connection drops before _transferCompleted)
```
States: `select-files` | `creating` | `waiting` | `receiver-joined` | `connecting` | `sending-file` | `verifying` | `sending-next` | `completed` | `failed`

### Receiver State Machine (v0.2.9 — Multi-File)
```
idle → looking-up → joining → connected → waiting-for-sender → receiving-file → verifying → completed (final)
                                                                                             → failed
```
States: `idle` | `looking-up` | `joining` | `connected` | `waiting-for-sender` | `receiving-file` | `verifying` | `completed` | `failed`

### Transfer Flow (Direct)
1. Sender selects one or more files (up to 20), creates guest session (POST /api/guest/sessions)
2. QR shown with URL: `/receive?code=CODE&session=SESSION_ID`
3. Receiver scans QR or enters code manually
4. Receiver calls PATCH with `transfer_code` (not `transfer_secret`) to join
5. Receiver sends "receiver-joined" signal via POST /api/guest/signal
6. Sender's PollSignaling receives "receiver-joined", starts WebRTC offer
7. Sender forwards subsequent signals (answer, ICE candidates) to `engine.handleSignal()`
8. DataChannel opens, **batch transfer** begins
9. Batch protocol: `batch-metadata` → (metadata → chunks → checksum → checksum-ok → file-complete) × N → `batch-complete`
10. Each file verified individually with SHA-256 checksum
11. Receiver downloads per-file via `<a download>` links on completion page; Download All uses Web Share API (iOS) or sequential delayed anchor clicks (desktop)
12. Sender marks `_transferCompleted = true` after receiving `batch-received` from receiver

### Key File Locations
| File | Purpose |
|------|---------|
| `src/app/page.tsx` | Homepage (Send/Receive cards only) |
| `src/app/send/page.tsx` | Send flow: method + file → QR + code → status → transfer |
| `src/app/receive/page.tsx` | Receive flow: QR info + code entry → auto-join → download |
| `src/app/t/[code]/page.tsx` | Cloud Transfer download page |
| `src/app/api/guest/sessions/route.ts` | Guest session CRUD (POST, GET, PATCH) |
| `src/app/api/guest/signal/route.ts` | Guest signaling (POST, GET) |
| `src/app/api/guest/upload/route.ts` | Guest cloud upload (no auth, session secret verified) |
| `src/app/api/upload/route.ts` | Authenticated upload (account users) |
| `src/app/api/download/[code]/route.ts` | File download by claim code |
| `src/app/api/claim/[code]/route.ts` | Transfer metadata lookup |
| `src/components/qr-display.tsx` | Server-rendered QR code using `qrcode` library |
| `src/components/site-header.tsx` | Header + mobile bottom nav with iOS safe area |
| `src/lib/webrtc/webrtc-engine.ts` | WebRTC engine: RTCPeerConnection, DataChannel, chunked transfer, SHA-256, batch protocol (sendFiles), message queue for serial async processing, bufferedAmount backpressure, per-file timeout, diagnostic logging |
| `src/lib/webrtc/poll-signaling.ts` | HTTP polling signaling for guest users (no Supabase) — logs request/response/errors |
| `src/lib/webrtc/signaling.ts` | Supabase Realtime signaling for signed-in users |
| `src/lib/transfer-methods.ts` | Transfer method abstraction (Direct Transfer, Bluetooth, Cloud Transfer) |
| `src/lib/ephemeral-names.ts` | Guest name generator ("Blue Falcon") + `generatePairCode()` using `crypto.getRandomValues()` |
| `src/app/diagnostics/page.tsx` | Diagnostics page (device, WebRTC, ICE, browser info) |

### API Endpoints
| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| POST | `/api/guest/sessions` | Create guest session | None |
| GET | `/api/guest/sessions?code=` | Lookup by pair code | None |
| GET | `/api/guest/sessions?session_id=` | Lookup by ID | None |
| PATCH | `/api/guest/sessions` | Update session (secret for full, transfer_code for join) | transfer_code or secret |
| POST | `/api/guest/signal` | Send signaling message | None (session existence check) |
| GET | `/api/guest/signal?session_id=` | Poll for signals | None |
| POST | `/api/guest/upload` | Upload file (guest cloud) | Session secret (header) |
| POST | `/api/upload` | Upload file (account) | Supabase auth |
| GET | `/api/download/[code]` | Download file | None |
| GET | `/api/claim/[code]` | Transfer metadata | None |

### Database Migrations (Supabase, shared with OpenSprout)

| Migration | Table(s) | Purpose |
|-----------|----------|---------|
| `20260623000001` | `opensend_transfers` | Core transfer records |
| `20260623000002` | `opensend_transfer_events` | Transfer event audit log |
| `20260623000003` | `opensend_mcp_tokens` | MCP auth tokens |
| `20260623000004` | `opensend_storage` | Storage metadata |
| `20260623000005` | `opensend_devices` | Device registry |
| `20260623000006` | `opensend_transfer_sessions` | P2P session coordination |
| `20260623000007` | `opensend_transfers` (alter) | P2P columns (session_id, checksum, device_ids) |
| `20260623000008` | `opensend_guest_sessions` | Guest transfer sessions (no account) |
| `20260623000009` | `opensend_guest_signals` | Guest signaling messages |

### MCP Tools (apps/mcp/)
12 tools total:

**Transfer:** `list_my_transfers`, `get_transfer`, `delete_transfer`, `export_transfer_history`
**Device:** `list_my_devices`, `get_device`, `rename_device`, `list_transfer_history`
**Session:** `list_transfer_sessions`, `get_transfer_session`, `list_online_devices`, `get_device_status`

## Design
- **Brand color:** `#bc3fde` (purple)
- **Dark mode:** Deep purple bg (`#1a0422`), light text (`#ffffff`)
- **Light mode:** Lavender bg (`#faf0ff`), dark text (`#1a0422`)
- **Surface:** Dark `#240a30`, Light `#f5e6fa`
- **Font:** Noto Sans Math (Regular 400 only — faux-bold for heavier weights)
- **Buttons:** Pill-shaped (`rounded-full`)
- **Philosophy:** Transfer terminal, not dashboard
- **Mobile:** Bottom nav (Transfer, History, Diagnostics, Profile) with iOS safe area

## Rules for AI Agents
1. All OpenSend DB resources use `opensend_` prefix (never modify OpenSprout tables)
2. Guest transfers must never depend on Supabase auth or accounts
3. Every Supabase query must scope by `user_id` (for signed-in users)
4. MCP tools must maintain strict user isolation
5. WebRTC engine uses hardcoded STUN servers + optional TURN env vars (`NEXT_PUBLIC_TURN_*`)
6. Do not claim E2EE unless fully implemented
7. Dark mode is default for all CSS; light mode is `.light` class override on `<html>`
8. Theme toggle uses `style.setProperty()` to bypass Tailwind v4 CSS cascade issues
9. `body {}` rules must be outside `@layer` blocks to survive Tailwind v4 compilation
10. Contact for all OpenSend projects: sparshsam@gmail.com
11. Do not claim real-device transfer success unless Sparsh manually confirms
12. PATCH `/api/guest/sessions` accepts `transfer_code` for receiver join (limited to `receiver_name` + `status: "paired"`); full `transfer_secret` required for sender-level changes
13. The `_transferCompleted` flag in WebRTCEngine prevents connection-close-after-completion from overwriting the completed state
14. `handleDataChannelMessage` handles `checksum-ok` and `checksum-fail` to complete the sender's verification phase
15. **Receiver must register `poll.onSignal(msg => engine.handleSignal(msg))`** before `poll.start()` — without this, iOS sender's trickle ICE candidates are never processed and connection fails
