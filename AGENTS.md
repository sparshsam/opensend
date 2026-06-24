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

## Architecture

### Transfer Methods
1. **Wi-Fi / Direct** (primary) — WebRTC P2P via STUN/TURN. Default.
2. **Bluetooth** (foundation) — Browser Web Bluetooth, very limited support
3. **Cloud** (fallback) — Supabase Storage upload/download

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

### Homepage Views
The homepage uses a `PageView` union: `"landing" | "send" | "receive" | "enter-code" | "qr-scan"`
- **landing:** Send/Receive buttons, transfer method selector, active transfers, incoming requests
- **send:** File picker → generate code → show QR + pair code → wait for receiver → WebRTC transfer
- **receive:** Code entry prompt with ephemeral identity
- **enter-code:** Large text input for 6-char pair code

### Guest Session API
- `POST /api/guest/sessions` — create session (sender_name, file_name, file_size, mime_type)
- `GET /api/guest/sessions?code=XXXXXX` — lookup by pair code (returns session info)
- `GET /api/guest/sessions?session_id=UUID&secret=SECRET` — lookup by ID (for polling client)
- `PATCH /api/guest/sessions` — update (requires session_id + secret)
- `POST /api/guest/signal` — send signaling message (requires session_id + secret)
- `GET /api/guest/signal?session_id=UUID&since=ISO` — poll for new signals

### Key Files
| File | Purpose |
|------|---------|
| `src/lib/webrtc/webrtc-engine.ts` | WebRTC engine: RTCPeerConnection, DataChannel, chunked transfer, SHA-256, progress, sendFile/acceptConnection |
| `src/lib/webrtc/poll-signaling.ts` | HTTP polling signaling for guest users (no Supabase) |
| `src/lib/webrtc/signaling.ts` | Supabase Realtime signaling for signed-in users |
| `src/lib/transfer-methods.ts` | Transfer method abstraction (Wi-Fi, Bluetooth, Cloud) |
| `src/lib/ephemeral-names.ts` | Guest name generator ("Blue Falcon") + `generatePairCode()` using `crypto.getRandomValues()` |
| `src/lib/guest-device.ts` | Local guest device identity (localStorage) |
| `src/lib/local-history.ts` | Local-first transfer history (200 entries max) |
| `src/lib/device-detect.ts` | Browser/platform detection |
| `src/components/transfer-monitor.tsx` | Transfer progress UI (speed, %, ETA, compact/full) |
| `src/components/transfer-provider.tsx` | Transfer context (account-based transfers) |
| `src/components/device-provider.tsx` | Device registration context |
| `src/components/theme-toggle.tsx` | Dark/light mode toggle (class-based, CSS variable overrides) |
| `src/app/` | All API routes and pages |
| `src/app/api/guest/sessions/route.ts` | Guest session CRUD |
| `src/app/api/guest/signal/route.ts` | Guest signaling endpoint |
| `src/app/diagnostics/page.tsx` | Diagnostics page (device, WebRTC, ICE, browser info) |
| `supabase/migrations/` | All DB migrations (see below) |

### Database Migrations (Supabase, shared with OpenSprout)

| Migration | Table(s) | Purpose |
|-----------|----------|---------|
| `20260623000001` | `opensend_transfers` | Core transfer records |
| `20260623000002` | `opensend_transfer_events` | Transfer event audit log |
| `20260624000001` | `opensend_guest_transfers`, `opensend_guest_signals` (v0.2.5 rename) | Guest connectivity |
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
