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
1. **Wi-Fi / Direct** (primary) — WebRTC P2P via STUN/TURN
2. **Bluetooth** (foundation) — Browser Web Bluetooth, limited support
3. **Cloud** (fallback) — Supabase Storage upload/download

### Signaling
- **Guest transfers:** HTTP polling (`PollSignaling`) — no auth, no WebSocket
- **Account transfers:** Supabase Realtime (`SignalingService`) — requires login

### Key Files
- `src/lib/webrtc/webrtc-engine.ts` — WebRTC engine (RTCPeerConnection, DataChannel, chunked transfer, SHA-256)
- `src/lib/webrtc/signaling.ts` — Supabase Realtime signaling (for signed-in users)
- `src/lib/webrtc/poll-signaling.ts` — HTTP polling signaling (for guest users)
- `src/lib/transfer-methods.ts` — Transfer method abstraction
- `src/lib/ephemeral-names.ts` — Guest device name generator
- `src/lib/guest-device.ts` — Local guest device identity
- `src/lib/local-history.ts` — Local-first transfer history
- `src/lib/device-detect.ts` — Browser/platform detection
- `src/components/transfer-monitor.tsx` — Transfer progress UI
- `src/components/transfer-provider.tsx` — Transfer context provider
- `src/components/device-provider.tsx` — Device registration context
- `src/components/theme-toggle.tsx` — Dark/light mode toggle
- `src/app/api/guest/sessions/route.ts` — Guest session API
- `src/app/api/guest/signal/route.ts` — Guest signaling API
- `supabase/migrations/` — All DB migrations

### Database (Supabase, shared with OpenSprout)
All OpenSend tables use `opensend_` prefix:
- `opensend_transfers` — File transfer records
- `opensend_transfer_events` — Event audit log
- `opensend_transfer_sessions` — P2P session coordination
- `opensend_guest_sessions` — Guest transfer sessions (no account needed)
- `opensend_guest_signals` — Guest signaling messages (HTTP polling)
- `opensend_devices` — Registered devices (signed-in users)
- `opensend_mcp_tokens` — MCP auth tokens

### MCP Tools
- `list_my_transfers`, `get_transfer`, `delete_transfer`, `export_transfer_history`
- `list_my_devices`, `get_device`, `rename_device`, `list_transfer_history`
- `list_transfer_sessions`, `get_transfer_session`, `list_online_devices`, `get_device_status`

## Design
- **Brand color:** `#bc3fde` (purple)
- **Dark mode:** Deep purple bg (`#1a0422`), light text
- **Light mode:** Lavender bg (`#faf0ff`), dark text
- **Font:** Noto Sans Math
- **Buttons:** Pill-shaped (`rounded-full`)
- **Philosophy:** Transfer terminal, not dashboard

## Rules for AI Agents
1. All OpenSend DB resources use `opensend_` prefix (never modify OpenSprout tables)
2. Guest transfers must never depend on Supabase auth or accounts
3. Every Supabase query must scope by `user_id` (for signed-in users)
4. MCP tools must maintain strict user isolation
5. WebRTC engine uses hardcoded STUN servers + optional TURN env vars
6. Do not claim E2EE unless fully implemented
7. Dark mode is default for all CSS; light mode is `.light` class override
8. Contact for all OpenSend projects: sparshsam@gmail.com
