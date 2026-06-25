# Changelog

## v0.4.0 (2026-06-25) — Production Transfer Engine

### Added
- **Adaptive chunk sizing**: Chunk size dynamically adjusts based on connection quality (8KB poor, 16KB fair, 64KB good). Connection quality estimated from measured throughput.
- **Sliding-window speed measurement**: Speed averaged over last 8 samples with EWMA smoothing (`alpha=0.3`). Clamped to prevent unrealistic jumps. `speedAvgBps` field on `TransferProgress`.
- **Exponential backoff retry with jitter**: Chunk retries use `base*2^attempt + 0-30% jitter`. Max retries increased from 3 to 4.
- **Exponential backoff ICE restart delays**: Disconnected check delay adapts from 5s base with backoff.
- **Cancel button during active transfer**: Both send and receive pages show a cancel button during file transfer. Cancellation propagated via `cancel` and `cancel-ack` messages.
- **P2P → Cloud automatic fallback**: When direct transfer fails, "Switch to Cloud Transfer" button appears on the failed state.
- **Receiver-side ICE restart**: Receiver now also attempts ICE restart on connection failure.
- **Session reconnection foundation**: `PollSignaling` supports `sendCancel()` for clean cancel propagation.
- **MCP agent setup prompt**: Profile page shows a pre-built prompt box with token + endpoint that users can give to their AI agent.
- **Structured diagnostic logging**: Engine logs include category prefixes (`[lifecycle]`, `[ice]`, `[batch]`, `[verify]`, `[error]`, `[cancel]`) for easier debugging.

### Changed
- **Better backpressure management**: Reduced threshold from 1MB to 512KB with separate 2MB high watermark for tighter flow control.
- **Smarter retry strategy**: File retry increased from 1 to 2 attempts, with exponential backoff between retries.
- **Adaptive per-file timeout**: File timeout scales with file size (`max(120s, size/10000)`) instead of fixed 120s.
- **Progress smoothing**: Speed display uses `speedAvgBps` (smoothed) instead of raw `speedBps` — no more jumpy percentages.
- **PollSignaling backoff**: Between-poll interval increases on failure (x1.5, capped at 5s) instead of fixed 500ms.
- **Cancel signal detection**: PollSignaling detects incoming cancel signals and stops immediately.
- **Better memory management**: Chunks are fully loaded at send time but cleared between files to free memory.
- **Pacing preserved**: 100ms delay between files maintained for Safari stability.

### Fixed
- Chunk ack listener now uses persistent listener with `removeEventListener` cleanup — no more `{ once: true }` race conditions.
- Cancelled transfer no longer overwritten by late state changes — `_cancelled` flag guards all transitions.
- Message queue cleared on cancel to prevent processing messages after cancellation.
- `sendJSON` wrapped in try/catch for silent failure instead of throwing on closed channel.

## v0.2.13 (2026-06-24) — Multi-File Reliability + iPhone Fixes

### Fixed
- **iPhone → desktop connection**: Receiver was missing `poll.onSignal` handler — ICE candidates from iPhone (trickle ICE) were never processed. Android bundled candidates in SDP so it worked; iOS sends them separately. Added `poll.onSignal(msg => engine.handleSignal(msg))` on receiver.
- **Chunk ack listener race**: Per-chunk ack used `{ once: true }` — consumed by the next string message regardless of match. Any intermediate message (progress, metadata) caused 500ms timeout + retry, making small files take many seconds. Changed to persistent listener with `removeEventListener` cleanup.
- **Slow transfers**: Same root cause as above — fixed.
- **ICE disconnect race**: Connection "disconnected" no longer immediately fails — waits 5 seconds for possible recovery.
- **Download All**: Synchronous anchor creation loop only fired the last download. Changed to `setTimeout` with 300ms delays between each.
- **PDF opened inline on iOS**: Blob URLs now use `type: "application/octet-stream"` to force download prompt on all file types.
- **Single file had no manual download link**: Engine auto-downloaded single files via `triggerDownload()` before UI could render links. Removed auto-download — all files appear as tappable links on completion.
- **Invalid pair code**: Receiver no longer shows generic "Transfer failed" — stays on code entry screen with specific error messages.
- **WebRTC error handling**: `RTCPeerConnection`, `createDataChannel`, `createOffer`/`setLocalDescription` all wrapped in try/catch with diagnostic logging.

### Added
- **Download All button**: Uses `navigator.share({ files })` on iOS (share sheet with all files) — falls back to sequential anchor clicks on desktop.
- **Sender diagnostics**: Error messages include last 5 engine diagnostic events. "Copy Diagnostics" includes full engine log.
- **Sender completion page**: Shows file list with names/sizes for batch transfers, "Back to home" button.
- **Receiver completion page**: Unified "Transfer complete" header, file list with per-file download links.
- **PollSignaling logging**: Signal `send()` now logs request type, HTTP status, and errors to console.
- **`cursor-pointer`**: Added to all back buttons, method selector buttons, history filter tabs.
- **Receive page reordered**: Code entry first (primary action), QR info section second.

### Changed
- **Version bump**: 0.2.13
- **Deployment domain**: `opensendbysparsh.vercel.app` set as primary alias.
- **Receiver help text**: "Tap a file to download it. Your browser will prompt you where to save it." (platform-neutral).

### Technical
- Chunk size reduced to 8KB for Safari compatibility.
- Message queue added to WebRTC engine for serial async processing.
- `batch-received` signal added to protocol — sender waits for receiver confirmation before marking complete.
- Database migration `20260624000010` — added `file_count`, `total_size`, `transfer_type` to `opensend_guest_sessions`.
- Guest sessions API now validates: max 20 files, max 50 MB per file, max 500 MB total.

## v0.2.12 (2026-06-24) — Multi-File Session Fix + Polish

### Added
- **Multi-file transfer**: send up to 20 files in a single transfer session via Direct Transfer
- **Batch WebRTC protocol**: `batch-metadata` → (metadata → chunks → checksum → file-complete) × N → `batch-complete`
- **Send page**: multi-file selection with `multiple` input, file list with per-file size, remove buttons, total size display, "Add more files" button
- **Receive page**: shows file count, total size, current file name, current file progress, overall batch progress bar, speed, ETA
- **Progress display**: dual progress bars — current file progress and overall batch progress
- **Individual file downloads**: each file verified separately and downloaded; manual download buttons if browser blocks automatic multi-download
- **Batch-aware local history**: new fields `transferType`, `fileCount`, `totalSize`, `fileNames`
- **Refresh guard**: `beforeunload` warning during active transfers on both send and receive pages
- **`file_count` field** in guest sessions API

### Changed
- **QR size**: reduced to 240px with responsive padding (mobile-optimized)
- **Footer**: reduced padding on mobile (`py-8 sm:py-12`, `mt-16 sm:mt-28`), centered text on small screens
- **README**: updated features with multi-file support; fixed brand color from `#2563EB` to `#BC3FDE` (purple)

### Fixed
- **Brand color in README**: was `#2563EB` (blue) — corrected to `#BC3FDE` (purple) matching the actual brand

### Technical
- `WebRTCEngine.sendFiles(files)` — sequential batch transfer with per-file checksum verification
- `BatchMetadata`, `BatchFileInfo` interfaces for batch protocol
- `onFileDownloaded`, `onBatchMetadata`, `onBatchComplete` callbacks on WebRTCEngine
- `TransferProgress` extended with: `currentFileIndex`, `fileCount`, `currentFileName`, `overallPercent`, `filesCompleted`
- `LocalHistoryEntry` extended with batch fields

## v0.2.8 (2026-06-24)

### Fixed
- **Sender stuck on "verifying" then fails "Connection lost"** — `handleDataChannelMessage` was missing `"checksum-ok"` and `"checksum-fail"` handlers. The receiver sends these acknowledgments over the data channel after verifying the file, but the sender's data channel message handler had no cases for them — they fell through silently. State stayed "verifying" until ICE naturally disconnected, which then flipped to "Failed". Now handles both responses correctly.
- **Receiver opens file in browser instead of downloading** — `URL.revokeObjectURL()` was called immediately after `a.click()`, causing browsers to fall back to inline preview. Now revoked after 10s delay. Anchor element is properly appended/removed from DOM.
- **Sender shows "Failed" after successful transfer** — Added `_transferCompleted` flag; once set, connection state changes are ignored.
- **ICE state tracking broken** — `(engine as any).pc` can't access private fields at runtime. Replaced with engine state-derived tracking.

### Added
- `"checksum-ok"` case in `handleDataChannelMessage` — sets state to "completed" and marks `_transferCompleted = true`
- `"checksum-fail"` case in `handleDataChannelMessage` — sets state to "error"
- Diagnostics include: `transferCompleted`, `bytesSent`, `expectedBytes` fields

### Changed
- **Sender UX copy**: "Complete" → "Sent successfully"
- **Receiver UX copy**: "Complete" → "Downloaded successfully"
- Download anchor appended to DOM before click and removed after (reliable cross-browser behavior)

### Fixed
- **QR now encodes a URL** instead of raw JSON — phone cameras open the receive page directly
- **Transfer stall after receiver joins** — sender's signal handler now forwards answer/ICE signals to WebRTC engine after the initial offer is sent
- **Mobile header overflow on iPhone** — desktop nav links hidden on mobile; bottom nav added with Transfer, History, Diagnostics, Profile
- **iOS safe area** respected in header and bottom nav via `env(safe-area-inset-*)`
- **useSearchParams Suspense boundary** — receive page properly wrapped for static generation

### Added
- **Receive page auto-join** — `/receive?code=CODE&session=SESSION_ID` auto-fills code, validates session, and starts join without manual entry
- **Clear error messages** for invalid code, expired code, reused code in receive flow
- **Copy diagnostics** button on sender and receiver failed states — copies session ID, code, role, state, ICE/DC state, last signal, last error to clipboard
- **Diagnostics state tracking** on sender: ICE state, DataChannel state, signal type tracking

### Changed
- **Status text cleanup** — sender states: "Waiting for receiver", "Receiver joined", "Creating secure connection", "Sending file", "Verifying transfer", "Complete", "Failed"
- **Status text cleanup** — receiver states: "Looking up session", "Joining session", "Connected to sender", "Waiting for sender", "Receiving file", "Verifying file", "Complete", "Failed"
- **QR rules** — Direct Transfer QR opens receive page with params (auto-join); Cloud Transfer QR points to download URL
- Updated docs and version bumped to 0.2.7

## v0.2.6 (2026-06-24)

### Fixed
- **Critical pairing bug**: receiver join now uses `transfer_code` instead of requiring `transfer_secret`, fixing "Invalid session secret" error
- PATCH `/api/guest/sessions` now accepts `transfer_code` for receiver join (limited to `receiver_name` + `status: "paired"`)
- Sender's `transfer_secret` is never exposed to receivers

### Added
- `/send` page: dedicated send flow with method selection, file picker, large QR+code display, and status states
- `/receive` page: dedicated receive flow with QR info + pair code entry
- `/api/guest/upload`: guest-compatible upload endpoint (no auth required, uses session secret)
- `QRDisplay` component: server-rendered QR codes using `qrcode` library
- Proper UI status states: Waiting, Connected, Connecting, Transferring, Verifying, Completed, Failed

### Changed
- **Homepage**: simplified to only Send and Receive cards (removed: Enter pair code button, transfer method selector, Wi-Fi/Direct/Bluetooth/Cloud pills)
- **Send page**: clear flow — select file → choose method → generate code + large QR → wait → transfer
- **Receive page**: shows QR scan info + pair code entry (pair code field moved here exclusively)
- **QR**: now large (280px) and central, using proper `qrcode` library instead of placeholder box
- **Transfer method labels**: `Wi-Fi / Direct` → `Direct Transfer`, `Cloud Relay` → `Cloud Transfer`
- **Helper text** added for each method:
  - Direct Transfer: "Best for nearby devices or normal browser-to-browser transfer."
  - Cloud Transfer: "Uploads temporarily, then receiver downloads."
  - Bluetooth: "Coming later for native apps."
- **Bluetooth**: always disabled regardless of browser support until native app is built
- **Cloud Transfer**: simpler path — upload to temporary storage, show download link/QR, receiver downloads directly (no WebRTC needed)
- Updated docs/transfer-methods.md, docs/guest-mode.md
- Version bumped to 0.2.6

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
