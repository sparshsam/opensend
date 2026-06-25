# OpenSend Project Context for AI Agents

## Project
OpenSend — Free, ad-free, open-source file sharing. Direct device-to-device transfers. No account required.

**Deployment:** https://send.kovina.org
**MCP endpoint:** `POST https://send.kovina.org/api/mcp` with `Authorization: Bearer *** **GitHub:** https://github.com/sparshsam/opensend
**Contact:** sparshsam@gmail.com

## Stack
- Next.js 15 (App Router) + TypeScript + Tailwind CSS 4
- Supabase (Postgres, Auth, Storage, Realtime)
- Vercel (deployment) + Cloudflare (DNS)
- WebRTC (device-to-device P2P transfers)
- Google OAuth (via Supabase — only auth provider)
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
| v0.2.6 | UX Cleanup + Pairing Fix — dedicated /send and /receive pages |
| v0.2.7 | QR Link Fix + Direct Transfer Handoff |
| v0.2.8 | Download Prompt + Completion State Fix |
| v0.2.9 | Multi-File Transfer — batch protocol, up to 20 files |
| v0.2.10 | Session Creation Fix — validation, error surfacing |
| v0.2.11 | Reliability + Completion Truth — chunk ack, backpressure, message queue |
| v0.2.12 | Batch Integrity + iPhone Picker — serialized message queue, `<label>` picker |
| v0.2.13 | iPhone Connection Fix + Download Polish — trickle ICE handler, persistent chunk ack, no auto-download |
| v0.3.0 | **Transfer Experience & UX Polish** — sender/receiver redesign, transfer receipts, error states, copy refinement |
| v0.3.1 | **Reliability Hardening** — resumable batches, ICE restart, rate limiting, API validation, diagnostics export, test fixtures |
| v0.3.2 | **MCP Server** — HTTP endpoint, 4 tools, token management API, profile panel, guest session tools (stdio) |
| v0.3.3 | **Google Auth** — switch from GitHub to Google OAuth |
| v0.3.4 | **Domain migration** — send.kovina.org, cleaned profile page, dynamic MCP endpoint |

## Architecture

### Pages
- `/` — Clean homepage with Send and Receive cards
- `/send` — Dedicated send flow: method + file selection → QR + code → progress → receipt
- `/receive` — Dedicated receive flow: code entry → waiting → progress → download screen
- `/t/[code]` — Download page for Cloud Transfer claim codes
- `/profile` — Account info, MCP token management, AI Access config

### Transfer Methods
1. **Direct Transfer** (primary) — WebRTC P2P via STUN/TURN. QR encodes receive page URL with params.
2. **Bluetooth** (disabled) — Always `supported: false`. Shows "Coming later for native apps."
3. **Cloud Transfer** (fallback) — Supabase Storage upload/download via `/api/guest/upload`.

### Signaling
- **Guest transfers:** HTTP polling (`PollSignaling`) — no auth, no WebSocket. Both parties poll `/api/guest/signal` every 500ms. Auto-stops on 410 (expired/cancelled) or 10 consecutive failures.
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

### Sender State Machine (v0.3.0)
```
select-files → creating → waiting → receiver-joined → connecting → sending-file → verifying → completed (final)
                                                                                                   → failed (after max 2 reconnect attempts)
```
States: `select-files` | `creating` | `waiting` | `receiver-joined` | `connecting` | `sending-file` | `verifying` | `sending-next` | `completed` | `failed`

### Receiver State Machine (v0.3.0)
```
idle → looking-up → joining → connected → waiting-for-sender → receiving-file → verifying → completed (final)
                                                                                             → failed
```
States: `idle` | `looking-up` | `joining` | `connected` | `waiting-for-sender` | `receiving-file` | `verifying` | `completed` | `failed`

### Transfer Flow (Direct, v0.3.1)
1. Sender selects files (up to 20), creates guest session (POST /api/guest/sessions) — rate limited to 5/min
2. QR shown with URL: `/receive?code=CODE&session=SESSION_ID`
3. Receiver scans QR or enters code manually
4. Receiver calls PATCH with `transfer_code` to join
5. Receiver sends "receiver-joined" signal via POST /api/guest/signal
6. Sender's PollSignaling receives "receiver-joined", engine created via useEffect
7. WebRTC offer/answer exchange via signaling
8. DataChannel opens, batch transfer begins
9. Batch protocol: `batch-metadata → (metadata → chunks → checksum → checksum-ok → file-complete) × N → batch-complete → batch-received`
10. Each file verified with SHA-256. Failed files are retried once then skipped.
11. ICE restart attempted on connection loss (up to 2 times)
12. Receiver shows per-file download links; Download All uses Web Share API or sequential anchor clicks
13. On completion: **transfer receipt** shown with file list, verified status, total size, method, duration, timestamp

### Key File Locations
| File | Purpose |
|------|---------|
| `src/app/page.tsx` | Homepage (Send/Receive cards) |
| `src/app/send/page.tsx` | Send flow: file selection → QR/code → progress → receipt with categorized errors |
| `src/app/receive/page.tsx` | Receive flow: code entry → progressive states → receipt-style download screen |
| `src/app/t/[code]/page.tsx` | Cloud Transfer download page |
| `src/app/profile/page.tsx` | Account info, MCP tokens create/list/revoke, AI Access endpoint |
| `src/app/auth/callback/route.ts` | OAuth callback — code exchange with profile fallback |
| `src/components/auth-provider.tsx` | Auth context — Google OAuth with explicit redirectTo |
| `src/components/mcp-tokens-panel.tsx` | Standalone MCP token component (legacy, logic now in profile page) |
| `src/app/api/guest/sessions/route.ts` | Guest session CRUD with rate limiting + validation |
| `src/app/api/guest/signal/route.ts` | Guest signaling with message type validation |
| `src/app/api/guest/upload/route.ts` | Guest cloud upload with MIME type validation |
| `src/app/api/mcp/route.ts` | MCP HTTP handler — JSON-RPC, Bearer auth, 4 tools |
| `src/app/api/mcp/tokens/route.ts` | MCP token create (POST) and list (GET) |
| `src/app/api/mcp/tokens/[id]/route.ts` | MCP token revoke (DELETE) |
| `src/components/qr-display.tsx` | Server-rendered QR code |
| `src/lib/webrtc/webrtc-engine.ts` | WebRTC engine: ICE restart, resumable batch, per-file retry, 120s timeout, diagnostics |
| `src/lib/webrtc/poll-signaling.ts` | HTTP polling with 410 detection, max failures, onExpired callback |
| `src/lib/api-validation.ts` | Shared validation: strings, numbers, UUID, rate limiting |
| `src/lib/transfer-methods.ts` | Transfer method abstraction |
| `src/lib/ephemeral-names.ts` | Guest name generator + `generatePairCode()` |
| `tests/webrtc-fixtures.ts` | Test fixtures: single/multi file, bad checksum, expired, duplicate join, cloud |
| `tests/setup.ts` | Mock DOM + WebRTC polyfills for Node.js testing |
| `apps/mcp/src/index.ts` | MCP stdio server entry — 14 tools |
| `apps/mcp/src/supabase.ts` | SHA-256 token auth against `opensend_mcp_tokens` |
| `apps/mcp/src/tools/transfers.ts` | Transfer tools (list, get, delete, export, history, sessions) |
| `apps/mcp/src/tools/devices.ts` | Device tools (list, get, rename, online status, sessions) |
| `apps/mcp/src/tools/guest-sessions.ts` | Guest session tools (create, lookup by code, lookup by claim) |

### API Endpoints
| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| POST | `/api/guest/sessions` | Create guest session (rate limited: 5/min) | None |
| GET | `/api/guest/sessions?code=` | Lookup by pair code | None |
| GET | `/api/guest/sessions?session_id=` | Lookup by ID | None |
| PATCH | `/api/guest/sessions` | Update session | transfer_code or secret |
| POST | `/api/guest/signal` | Send signaling message | None (validated) |
| GET | `/api/guest/signal?session_id=` | Poll for signals | None |
| POST | `/api/guest/upload` | Upload file (guest cloud) | Session secret |
| GET | `/api/download/[code]` | Download file | None |
| GET | `/api/claim/[code]` | Transfer metadata | None |
| POST | `/api/mcp` | MCP JSON-RPC (tools/list, tools/call) | Bearer token (SHA-256) |
| GET | `/api/mcp/tokens` | List user's MCP tokens | Supabase auth |
| POST | `/api/mcp/tokens` | Create MCP token | Supabase auth |
| DELETE | `/api/mcp/tokens/[id]` | Revoke MCP token | Supabase auth |
| GET | `/auth/callback` | OAuth callback (Google) | None (code exchange) |

### Database Migrations (Supabase, shared with OpenSprout)
All OpenSend tables use `opensend_` prefix.

| Migration | Table(s) | Purpose |
|-----------|----------|---------|
| Various | `opensend_transfers` | Core transfer records |
| Various | `opensend_guest_sessions` | Guest transfer sessions |
| Various | `opensend_guest_signals` | Guest signaling messages |
| Various | `opensend_mcp_tokens` | MCP auth tokens (SHA-256 hashed) |
| Various | `opensend_devices` | Device registry |
| Various | `opensend_transfer_sessions` | P2P session coordination |

## MCP Tools (apps/mcp/)

**HTTP endpoint (4 tools):**
- `lookup_guest_session` — Check a 6-char pair code status
- `lookup_transfer_by_code` — Look up cloud transfer by claim code
- `list_my_transfers` — List authenticated transfer history
- `describe_server` — Server info

**Stdio server (14 tools):**
- **Transfers:** `list_my_transfers`, `get_transfer`, `delete_transfer`, `export_transfer_history`
- **Devices:** `list_my_devices`, `get_device`, `rename_device`, `list_transfer_history`, `list_transfer_sessions`, `get_transfer_session`, `list_online_devices`, `get_device_status`
- **Guest sessions:** `create_guest_session`, `get_guest_session`, `get_transfer_by_claim_code`

## Design
- **Brand color:** `#bc3fde` (purple)
- **Dark mode:** Deep purple bg (`#1a0422`), light text (`#ffffff`)
- **Light mode:** Lavender bg (`#faf0ff`), dark text (`#1a0422`)
- **Surface:** Dark `#240a30`, Light `#f5e6fa`
- **Font:** Noto Sans Math (Regular 400 only — faux-bold for heavier weights)
- **Buttons:** Pill-shaped (`rounded-full`)
- **Philosophy:** Transfer terminal, not dashboard
- **Mobile:** Bottom nav with iOS safe area via `viewport-fit=cover`

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
13. `_transferCompleted` flag prevents connection-close-after-completion from overwriting state
14. `handleDataChannelMessage` handles `checksum-ok` and `checksum-fail` to complete verification
15. **Receiver must register `poll.onSignal(msg => engine.handleSignal(msg))`** before `poll.start()`
16. Google OAuth uses explicit `redirectTo` in `signInWithOAuth` options
17. Auth callback at `/auth/callback` redirects to `/profile` on both success and failure (browser client recovers session from cookies)
