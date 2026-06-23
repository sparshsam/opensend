# Changelog

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
