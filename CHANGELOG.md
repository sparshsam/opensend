# Changelog

## v0.2.5 (2026-06-24)

### Added
- Three transfer methods: Wi-Fi/Direct (primary), Bluetooth (foundation), Cloud (fallback)
- Transfer method abstraction with capability detection (`src/lib/transfer-methods.ts`)
- Guest flow wiring: PollSignaling + WebRTCEngine integrated into send/receive flow
- Pair code UX: large display, countdown timer, copy/share buttons
- QR display with session binding
- Transfer method selector on homepage
- AGENTS.md and CLAUDE.md with full project context
- docs/transfer-methods.md

### Changed
- Homepage redesigned: Send/Receive/Enter Code + transfer method selector
- Send flow: method selector → file picker → code display → wait → transfer
- Receive flow: code entry → join → WebRTC accept → file download
- SignalMessage type extended with receiver-joined, receiver-info
- Build validates clean with all types

## v0.2.4 (2026-06-24)

### Added
- HTTP polling signaling for guest transfers (no Supabase Realtime dependency)
- `opensend_guest_signals` table for signal message storage
- `PollSignaling` class — replaces Supabase Realtime for guest sessions
- Post-signal API at /api/guest/signal
- docs/guest-connectivity-audit.md — full audit of guest dependencies
- docs/security-review-v0.2.4.md — comprehensive security audit

### Fixed
- Pair codes now use `crypto.getRandomValues()` instead of `Math.random()`
- Guest session API supports lookup by session_id in addition to transfer_code

## v0.2.3 (2026-06-23)

### Added
- Self-contained `opensend_guest_sessions` table (no user_id, no device_id)
- Ephemeral device name generator ("Blue Falcon", "Quiet River", etc.)
- Guest session API (/api/guest/sessions — create, lookup, update)
- Pair code system: 6-character codes with 15-min expiry
- QR pairing data model
- Send/Receive/Pair Code homepage flow
- docs/guest-mode.md and docs/pairing.md

### Changed
- Homepage: guest-first with no account required
- Sign In moved to optional footer link

## v0.2.2 (2026-06-23)

### Added
- Guest device system (localStorage-based, no account)
- Local-first transfer history
- Chunk acknowledgement + retry logic (3 attempts per chunk)
- Diagnostics page (/diagnostics)
- TURN support via env vars (NEXT_PUBLIC_TURN_URLS, etc.)
- docs/turn-setup.md

### Changed
- Homepage: Send/Receive landing with guest-first messaging
- WebRTC engine: getIceServers() reads TURN env vars

## v0.2.1 (2026-06-23)

### Added
- WebRTC engine: RTCPeerConnection, DataChannel, ICE, chunked transfer
- SHA-256 checksum verification for every transfer
- Supabase Realtime signaling (SignalingService)
- Device heartbeat via Realtime presence (30s interval)
- Transfer session API (/api/sessions)
- QR pairing API (/api/qr)
- TransferProvider context for transfer management
- TransferMonitor component (speed, %, ETA)
- docs/webrtc-architecture.md

### Changed
- Homepage: file picker → device list → send flow
- History: sent/received tabs with device info

## v0.2.0 (2026-06-23)

### Added
- Direct device-to-device transfer foundation (WebRTC architecture)
- Device registration: auto-detect platform, OS, browser, device type
- Device management API (register, list, rename)
- `opensend_devices` table with RLS and ownership
- `opensend_transfer_sessions` table for P2P session coordination
- New transfer session endpoints (create, accept, decline)
- `opensend_transfers` extended with session_id, checksum, device IDs
- MCP tools: list_my_devices, get_device, rename_device, list_transfer_history
- Device detection utility (UA parsing, fingerprinting)
- DeviceProvider context for auto-registration
- History page redesigned: sent/received tabs with pill filter
- Transfer architecture docs (P2P primary, relay fallback)

### Changed
- History: removed cloud-drive list, now shows sent/received with device info
- Supabase types: added Device, TransferSession, new status enums
- MCP status filter: includes new P2P statuses (pending, waiting, transferring)

## v0.1.2 (2026-06-23)

### Added
- Real Supabase upload/download/delete backend (replaced simulated delay)
- Prefixed database tables (`opensend_transfers`, `opensend_transfer_events`, `opensend_mcp_tokens`)
- Storage bucket (`opensend-transfers`) with RLS policies
- API routes: upload, download, claim lookup, transfer CRUD, MCP token management
- Virus scanning stub with full lifecycle (`pending → scanning → clean → infected → error`)
- Abuse prevention groundwork (IP/UA hashing, block/report statuses, download limits)
- Password-protected transfer schema support (column + bcrypt hook)
- Claim code lookup endpoint (`/api/claim/[code]`)
- Transfer metadata display on download page before file download
- XMLHttpRequest-based upload with real progress bar
- MCP: updated to `opensend_transfers` table, extended status filter
- Mobile-first UX: larger tap targets, inline copy actions, thumb-friendly layout
- GitHub repo files: CONTRIBUTING.md, SECURITY.md, CODE_OF_CONDUCT.md, AGPLv3 LICENSE
- Documentation: architecture.md, supabase-shared-project.md, release-checklist.md, privacy-and-abuse.md
- Vercel deployment at opensend-app.vercel.app
- README badges (build, license, version, Next.js, Supabase, Vercel, TypeScript)

### Changed
- Upload terminal: real progress bar, error handling, cancel support
- Download page: metadata-first flow with claim code validation
- History page: real API data with delete action
- All tables use `opensend_` prefix to coexist with shared OpenSprout Supabase project
- Backend uses service role with explicit user_id filtering and ownership checks
- ESLint config uses FlatCompat for Next.js 15 compat

### Fixed
- TypeScript strict mode errors in Supabase middleware
- MCP test mocking (global crypto, vi.stubGlobal, configurable mock responses)

## v0.1.1 (2026-06-23)

Initial open-source release.

### Added
- Upload terminal with file dropzone (50 MB limit)
- Share link + claim code generation
- Download page by claim code
- Transfer history with status tracking
- User profile with GitHub OAuth
- Supabase schema (transfers, mcp_tokens)
- MCP server (list_my_transfers, get_transfer, delete_transfer, export_transfer_history)
- Store-ready assets (icons, splash, PWA manifest)
- Privacy Policy, Terms of Service, Support page
- CI/CD pipeline (typecheck, lint, tests, deploy)
- Design Playbook compliance (dark-first, pill buttons, editorial typography)
- MCP Build Guide compliance (SHA-256 auth, user isolation, ownership checks)
