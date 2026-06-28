# OpenSend v0.9.4 — CLAUDE.md

## Project
Repository at `/home/spars/repos/opensend/`.  
Deployed at **https://send.kovina.org**  
Contact: **sparshsam@gmail.com**  
GitHub: **https://github.com/sparshsam/opensend**

## Current Release
**v0.9.4 — Android Debug Build** (tag `v0.9.4`, commit `db8ce81`)
Deployed and live on `send.kovina.org`. APK at `C:\Users\spars\Desktop\OpenSend-v0.9.4-debug.apk`.

## All Versions Built This Session

| Version | Focus | Commit |
|---------|-------|--------|
| **v0.4.0** | Production Transfer Engine | `5c1d63b` |
| **v0.5.0** | PWA Production | `00af551` |
| **v0.6.0** | Android Application (Capacitor) | `a6ed3f9` |
| **v0.7.0** | Windows Application (Electron) | `81ecd66` |
| **v0.8.0** | Security & Privacy | `dc34e3b` |
| **v0.9.0** | Trusted Devices | `c6d58d9` |
| **v0.9.1** | Profile MCP Connection Guide | `2387b82` |
| **v0.9.2** | Diagnostics Copy Button | `0928b18` |
| **v0.9.3** | is_favorite migration + RLS audit | `4bc79c2` |
| **v0.9.4** | Android Debug Build + API fetch fix + CORS | `db8ce81` |
| **v0.9.5** | **Icon Refresh + APK API Routing + Native Google Sign-In + Diagnostics Cleanup** — new app icon, adaptive icon XML at viewport sizes, native URL resolution, native Google auth via @capacitor/browser, white screen fix, diagnostics with separate copy buttons, receiver paste button | `151de9e` |

All versions pushed to GitHub `main`.

## Key Facts

### Pages
- `/` — Clean homepage with Send and Receive cards
- `/send` — Send flow: method selection → file pick → QR + code → progress → receipt
- `/receive` — Receive flow: code entry → waiting → progress → download screen
- `/t/[code]` — Download page for Cloud Transfer claim codes
- `/profile` — Account info, trusted devices, MCP tokens, sync settings, sign-out
- `/history` — Transfer history with sent/received filters, favorites, delete
- `/diagnostics` — Debug info for troubleshooting
- `/privacy`, `/terms`, `/support` — Legal/help pages

### PWA (v0.5.0)
- Service worker at `/sw.js` — cache-first for assets, network-first for pages, versioned caches
- Install prompt (beforeinstallprompt) with floating UI
- Update notification (detects waiting SW, one-click update + reload)
- Manifest with shortcuts (Send/Receive), maskable icons, orientation, categories
- iOS PWA: apple-touch-icon, 8 splash sizes with media queries, viewport-fit=cover
- OG image (1200x630), Twitter card, metadataBase

### Icons & Assets (v0.5.0+, refreshed v0.9.5)
- **Source:** `public/opensend-icon.png` (1024×1024) — new icon, copied from `/mnt/c/Users/spars/Downloads/App Icons/opensend.png`
- **Generator script:** `scripts/generate-icons.js` — reads source PNG, uses `sharp` to produce all 44 derived assets in one shot
- **PWA web:** 14 icons (48–512px including `apple-touch-icon`), all regenerated
- **Favicon:** `favicon.ico` (ICO-wrapped 32px), `favicon.svg` (inline-PNG), `favicon-16.png`, `favicon-32.png`
- **iOS splash:** 8 sizes (`splash-640x1136` through `splash-2048x2732`) — icon centered on `#bc3fde` background
- **Social:** `opengraph-image.png` (1200×630) — icon + "OpenSend" title + tagline on `#bc3fde`
- **Android mipmap:** `ic_launcher`, `ic_launcher_round`, `ic_launcher_foreground` at 5 densities (48–192px), all regenerated
- **Play Store:** icon (512×512) + feature graphic (1024×500) with icon left + branding text
- **Windows:** `.ico` generated from 32px PNG output (singular, not multi-size — `favicon.ico` covers the web use)

### Transfer Methods
- **Direct Transfer** (primary) — WebRTC P2P via STUN/TURN, QR encodes receive page URL
- **Bluetooth** (disabled) — Always `supported: false`, shows "Coming later for native apps."
- **Cloud Transfer** (fallback) — Supabase Storage upload/download via `/api/guest/upload`

### v0.4.0 Engine Improvements
- **Adaptive chunk sizing**: 8KB (poor), 16KB (fair), 64KB (good) — based on measured throughput
- **Sliding-window speed**: Last 8 samples, EWMA smoothing (alpha=0.3), `speedAvgBps` field
- **Exponential backoff retry** with jitter for chunks (max 4 retries) and files (max 2 retries)
- **Improved backpressure**: 512KB threshold + 2MB high watermark
- **Cancel button** during active transfer (both send + receive)
- **P2P→Cloud automatic fallback** on the failed state
- **Receiver-side ICE restart** (previously sender-only)
- **Adaptive per-file timeout**: scales with file size (`max(120s, size/10KB)`)
- **PollSignaling backoff**: x1.5 on failure, capped at 5s
- **Structured diag logging**: `[lifecycle]`, `[ice]`, `[batch]`, `[verify]`, `[cancel]`

### Security (v0.8.0)
- **E2EE module**: `src/lib/crypto/e2ee.ts` — optional AES-256-GCM via PBKDF2 (600K iterations)
- **Security headers**: CSP, HSTS (2yr + preload), XFO (DENY), X-Content-Type-Options, Permissions-Policy, Referrer-Policy, COOP, CORP — all set in `src/middleware.ts`
- **Session cleanup cron**: `/api/cron/cleanup` — expires stale sessions, cleans signals >1h, removes expired cloud transfers from storage
- **Rate limiting**: 5 guest sessions/min per IP (returns 429 with Retry-After)
- **Security docs**: `docs/security.md` — architecture, threat model, 22-item pen testing checklist

### Auth & Devices (v0.9.0)
- **Google OAuth** only (via Supabase). No GitHub.
- **Trusted devices**: Device registration with fingerprint, rename, revocation (DELETE endpoint)
- **Profile page**: Avatar circle, device list with initials avatars, sync toggle, MCP tokens, AI Access section
- **Transfer favorites**: PATCH `/api/transfers/favorite` endpoint
- **Sync toggle**: On/off switch for history sync

### MCP Server
- **HTTP endpoint**: `POST https://send.kovina.org/api/mcp` with `Authorization: Bearer <token>`
- 4 tools: `lookup_guest_session`, `lookup_transfer_by_code`, `list_my_transfers`, `describe_server`
- Token management: `GET/POST /api/mcp/tokens` (create/list), `DELETE /api/mcp/tokens/[id]` (revoke)
- Profile page has inline token management + AI setup prompt box
- **Stdio server** at `apps/mcp/` — 14 tools (transfers, devices, guest sessions)

### Android (v0.6.0)
- **Capacitor 8** with plugins: Share, Filesystem, App, SplashScreen, StatusBar, Keyboard, Preferences
- **Config**: `capacitor.config.ts` with app ID `org.kovina.opensend`
- **Android manifest**: INTERNET, CAMERA, POST_NOTIFICATIONS, network state, storage permissions, deep links (`opensend://`, `https://send.kovina.org` autoVerify)
- **Adaptive icons**: Vector drawable (purple bg + white arrow), raster at 5 mipmap densities
- **Build scripts**: `npm run android:build` (debug), `npm run android:release` (signed AAB)
- **Next.js export**: `CAPACITOR_BUILD=true` triggers static export via `next.config.ts`

### Desktop / Windows (v0.7.0)
- **Electron wrapper** at `apps/desktop/` — main process, preload bridge, app menu
- **Window**: 1100×800, dark background `#1a0422`, show-on-ready (no flash)
- **IPC handlers**: `dialog:openFiles`, `file:saveToDisk`, `file:showInFolder`, `app:getVersion`
- **electron-builder**: NSIS installer (per-machine), portable EXE, MSIX package
- **File association**: `.opensend` extension
- **Auto-update**: GitHub releases publish provider
- **Build scripts**: `npm run desktop:build`, `desktop:install`, `desktop:start`, `desktop:icons`

### PWA Foundation (v0.3.x)
- Two transfer methods: Direct (WebRTC P2P) and Cloud (Supabase Storage)
- Multi-file batch: up to 20 files, 50 MB each, 500 MB total, resumable
- Batch protocol with per-file checksums, retry, and failure reporting
- HTTP polling signaling (no Supabase dependency for guests)
- Message queue for serialized async data channel processing
- ICE restart with reconnection (up to 2 attempts on both sides)
- Categorized error states (expired, disconnected, not-found, too-large, unsupported)

### Brand
- Accent: `#bc3fde` purple
- Dark bg: `#1a0422`, light bg: `#faf0ff`
- Font: Noto Sans Math (Regular 400)
- Domain: `send.kovina.org` (Cloudflare DNS → Vercel hosting)

## Build

```bash
# Main project (web)
npm install
npm run typecheck
npm run lint
npm run build

# Deploy web (when rate limit allows)
npx vercel --prod --yes

# MCP server
cd apps/mcp && npm install && npm run typecheck && npm test

# Android debug
CAPACITOR_BUILD=true npm run build && npx cap copy android && cd android && ./gradlew assembleDebug

# Android release (requires keystore.properties)
npm run android:release

# Desktop Windows (requires electron deps)
cd apps/desktop && npm install
npm run desktop:build

# Generate icons
node scripts/generate-icons.js   # Generate ALL icons from source PNG (PWA, Android, iOS, favicon, social)
npm run desktop:icons             # Windows .ico (if separate from web favicon)
npm run android:icons             # Legacy Android script (superseded by generate-icons.js)
npx cap sync                      # Sync Android Capacitor assets
```

## Critical Rules
1. Never modify OpenSprout tables — all OpenSend resources use `opensend_` prefix
2. Guest flows must never require auth — no `user_id`, no device registry dependency
3. Every signed-in Supabase query must filter by `user_id`
4. MCP tools must maintain strict user isolation per query
5. Do not claim real-world transfer success unless manually tested by Sparsh
6. Do not claim E2EE unless fully implemented
7. WebRTC is already encrypted via DTLS at transport level; E2EE module is optional defense-in-depth
8. All builds (web + Android + desktop) push to `main` — web deploys from GitHub auto-deploy
9. Vercel free tier: 100 deploys/day limit. Plan upgrades or batch deploys accordingly
10. See `MANUAL_REVIEW_PENDING.md` for all pending manual tasks

## Capacitor / Android Build
- Build script: `bash scripts/capacitor-build.sh` — stashes API routes, injects BUILD_COMMIT, builds static export, restores routes, copies to Android, runs gradle
- Or in parts: `npm run android:build` -> runs the build script
- APK output: `android/app/build/outputs/apk/debug/app-debug.apk`
- Signing: `apksigner sign --ks ~/.android/debug.keystore --ks-key-alias androiddebugkey --ks-pass pass:android <apk>`
- Build marker auto-injected via `__BUILD_COMMIT__` / `__BUILD_TIME__` placeholders in `src/lib/api-fetch.ts`

### Capacitor API Routing
- Capacitor config: `androidScheme: 'https'` serves app from `https://localhost`, NOT file://
- Platform detection: `window.Capacitor.isNativePlatform()` (set by Capacitor bridge at runtime)
- All `/api/*` and `/auth/*` calls are redirected to `https://send.kovina.org/` via `apiFetch()` wrapper
- Production API requires `Access-Control-Allow-Origin: *` (set in middleware.ts) for Capacitor cross-origin requests
- CORS preflight (OPTIONS) handled in middleware.ts

## Manual Tasks Pending
See `MANUAL_REVIEW_PENDING.md` in repo root for the full list. Key items:
- Run `npx vercel --prod --yes` to deploy all versions
- Generate Android keystore + Windows code signing cert
- Test real transfers on iOS, Android, Windows
- Review Supabase RLS policies
