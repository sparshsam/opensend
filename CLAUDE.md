# OpenSend v0.2.5 — CLAUDE.md

## Project
Repository at `/home/spars/repos/opensend/`.  
Deployed at **https://opensendbysparsh.vercel.app**  
Contact: **sparshsam@gmail.com**

## Current State
v0.2.5 — Transfer Methods + Guest Flow Wiring

## Key Facts
- **Three transfer methods:** Wi-Fi/Direct (primary), Bluetooth (foundation), Cloud (fallback)
- **Guest transfers:** HTTP polling signaling (`PollSignaling`) — no Supabase dependency
- **Account transfers:** Supabase Realtime (`SignalingService`) — requires login
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

## Guest Session Lifecycle
```
created → waiting → paired → transferring → completed
  |          |          |           |
  expired   expired   cancelled    failed
```
Session auto-expires after 15 minutes. Pair codes: 6 chars, `crypto.getRandomValues()`.

## Guest Flow (Code-Wired)
Sender: `/landing/send` → pick file → create session → show code → wait (polling) → WebRTC send
Receiver: `/landing/enter-code` → enter code → join → WebRTC accept → save file

Not manually tested — requires real device-to-device validation.
