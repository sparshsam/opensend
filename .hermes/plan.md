# OpenSend v0.1.1 — Build Complete

## Final Project Structure

```
/home/spars/repos/opensend/
├── src/
│   ├── app/
│   │   ├── layout.tsx            # Root layout (Inter font, dark-first, header+footer)
│   │   ├── page.tsx              # Upload terminal (drop → upload → result)
│   │   ├── globals.css           # Playbook tokens (true black, pill buttons, type scale)
│   │   ├── t/[code]/page.tsx     # Download by claim code
│   │   ├── history/page.tsx      # Transfer history with status
│   │   ├── profile/page.tsx      # Profile + GitHub OAuth
│   │   ├── privacy/page.tsx      # Privacy Policy
│   │   ├── terms/page.tsx        # Terms of Service
│   │   ├── support/page.tsx      # Support + FAQ
│   │   └── auth/callback/route.ts # OAuth callback
│   ├── components/
│   │   ├── ui/
│   │   │   ├── button.tsx        # Pill buttons (primary/secondary/danger/ghost)
│   │   │   └── input.tsx         # Muted rounded inputs with focus ring
│   │   ├── file-dropzone.tsx     # Drag-and-drop upload (50 MB validation)
│   │   ├── auth-provider.tsx     # Supabase auth context
│   │   ├── site-header.tsx       # Pill nav: Transfer / History / Profile
│   │   └── site-footer.tsx       # Privacy / Terms / Support
│   ├── lib/
│   │   ├── utils.ts              # cn(), formatBytes(), formatDate(), generateClaimCode()
│   │   └── supabase/
│   │       ├── client.ts         # Browser client
│   │       ├── server.ts         # Server client + getCurrentUser()
│   │       └── middleware.ts     # Cookie-based session refresh
│   └── middleware.ts             # Next.js middleware
├── apps/
│   └── mcp/
│       ├── package.json          # ESM, @modelcontextprotocol/sdk + @supabase/supabase-js
│       ├── tsconfig.json
│       ├── vitest.config.ts
│       ├── src/
│       │   ├── index.ts          # Entry: auth → register tools → stdio server
│       │   ├── supabase.ts       # SHA-256 token auth + service-role client
│       │   ├── types.ts          # Database types
│       │   ├── tools/
│       │   │   └── transfers.ts  # 4 tools: list, get, delete, export
│       │   └── __tests__/
│       │       ├── auth.test.ts  # 5 tests: missing creds, invalid, revoked, valid
│       │       └── tools.test.ts # 4 tests: registration, output, scoping, ownership
│       └── dist/                 # (built with tsc)
├── supabase/
│   └── migrations/
│       ├── 20260623000001_create_transfers.sql  # transfers table + storage + RLS
│       └── 20260623000002_create_mcp_tokens.sql  # mcp_tokens table + RLS
├── public/
│   ├── icon.svg, icon-512x512.svg, icon-192x192.svg
│   ├── apple-touch-icon.svg, favicon.svg
│   ├── splash-1242x2688.svg, splash-2048x2732.svg
│   └── manifest.json
├── docs/
│   └── store-readiness.md        # App Store compliance checklist
├── .github/workflows/ci.yml      # Typecheck + lint + test + deploy
├── .env.example
├── CHANGELOG.md
├── README.md
├── DESIGN_PLAYBOOK.md             # Reference copy
└── MCP-SERVER-BUILD-GUIDE.md      # Reference copy
```

## Build Status

| Check | Status |
|-------|--------|
| Next.js build | ✓ Compiled (11 pages, 4 dynamic) |
| TypeScript (main) | ✓ 0 errors |
| TypeScript (MCP) | ✓ 0 errors |
| MCP tests | ✓ 9/9 passing |
| ESLint | ✓ Clean |

## Key Design Decisions

- **Metaphor:** Transfer terminal (not a dashboard) — single-column vertical flow
- **Brand color:** `#2563EB` — rich action blue
- **Dark-first** — true black canvas, light mode courtesy (prefers-color-scheme)
- **Pill buttons** — rounded-full everywhere, no square corners
- **No cards** — result page uses receipt ticket (border-dashed separator, data rows)
- **Typography:** Sora-like Inter font with 900-weight for hero/display

## Next Steps (for deployment)

1. Create Supabase project
2. Run migrations via `supabase db push` or apply SQL in Supabase dashboard
3. Set up GitHub OAuth in Supabase Auth
4. Create storage bucket `transfers`
5. Deploy to Vercel
6. Add real upload API routes (currently uses mock/simulated upload)
