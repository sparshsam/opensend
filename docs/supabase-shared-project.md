# Shared Supabase Project

OpenSend shares a Supabase project with OpenSprout to stay within the free plan limit (2 projects).

## Project Details

- **Name:** OpenSprout (kolovoz-advisory workspace)
- **URL:** `https://rbdyrymtgfqqkdemicdo.supabase.co`
- **Plan:** Free

## Isolation Strategy

All OpenSend tables use the `opensend_` prefix to avoid collisions:

| OpenSend Table | Prefix | Purpose |
|---------------|--------|---------|
| `opensend_transfers` | `opensend_` | File transfer records |
| `opensend_transfer_events` | `opensend_` | Audit/event log |
| `opensend_mcp_tokens` | `opensend_` | MCP auth tokens |

Storage bucket: `opensend-transfers` (also prefixed)

## Migration Policy

- All OpenSend migrations live in `supabase/migrations/` with sequential timestamps
- Run alongside existing OpenSprout migrations (they never modify OpenSprout tables)
- Apply via: `npx supabase db push` or paste SQL in Supabase SQL Editor
- Never modify or drop OpenSprout tables, types, or policies

## Environment Variables

```env
# Shared with OpenSprout (same project)
NEXT_PUBLIC_SUPABASE_URL=https://rbdyrymtgfqqkdemicdo.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_xheYfHt4QRbvJpSaEsJE2A_yZU2tzlJ

# OpenSend-specific (set in Vercel)
SUPABASE_SERVICE_ROLE_KEY=<from Supabase dashboard>
```

## Rows that Should Never Be Touched

- Tables: `profiles`, `plants`, `care_schedules`, `care_logs`, `task_instances`, `journal_entries`, `knowledge_articles`, `diagnosis_entries`, `mcp_tokens` (OpenSprout's), `identifications`
- Storage buckets: `plant-photos`, `backups`
- Auth configuration (GitHub OAuth for OpenSprout)
