# OpenSend v0.2.5 — CLAUDE.md

## Project
OpenSend is at `/home/spars/repos/opensend/`. Deployed at opensendbysparsh.vercel.app.
Contact: sparshsam@gmail.com

## Current State
v0.2.5 — Transfer Methods + Guest Flow Wiring

## Key Facts
- Three transfer methods: Wi-Fi/Direct (primary), Bluetooth (foundation), Cloud (fallback)
- Guest transfers use HTTP polling signaling (no Supabase dependency)
- Account transfers use Supabase Realtime signaling
- Brand color: #bc3fde, dark bg: #1a0422, light bg: #faf0ff
- Font: Noto Sans Math (Regular weight only)
- All DB tables prefixed `opensend_`
- Shared Supabase project with OpenSprout (rbdyrymtgfqqkdemicdo.supabase.co)
- MCP server at apps/mcp/ with 12 tools
- Service role key set in Vercel env vars

## Build
```bash
npm install && cd apps/mcp && npm install && cd ../..
npm run typecheck && npm run lint && npm run build
cd apps/mcp && npm run typecheck && npm test
npx vercel --prod --yes
```

## Critical Rules
1. Never modify OpenSprout tables
2. Guest flows must never require auth
3. Every signed-in query must filter by user_id
