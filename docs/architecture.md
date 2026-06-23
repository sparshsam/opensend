# OpenSend Architecture v0.1.2

## Overview

OpenSend is a server-rendered Next.js application with a standalone MCP server for AI agent integration. The app runs on Vercel with Supabase as its data and storage backend.

## Stack

```
Frontend:    Next.js 15 (App Router) + Tailwind CSS 4
Backend:     Next.js API routes (serverless functions)
Database:    Supabase Postgres (shared project with OpenSprout)
Storage:     Supabase Storage (private bucket, 50 MB limit)
Auth:        Supabase Auth (GitHub OAuth)
MCP:         @modelcontextprotocol/sdk (stdio transport)
Deploy:      Vercel
```

## Architecture Diagram

```
User Browser
     │
     ▼
┌──────────────────┐     ┌──────────────────┐
│  Next.js Pages   │     │  API Routes      │
│  / (upload)      │────►│  /api/upload      │
│  /t/[code]       │     │  /api/download/*  │
│  /history        │     │  /api/claim/*     │
│  /profile        │     │  /api/transfers/* │
│  /privacy,terms  │     │  /api/auth/token  │
└──────────────────┘     └────────┬─────────┘
                                  │
                    ┌─────────────▼──────────┐
                    │     Supabase            │
                    │  ┌───────────────────┐  │
                    │  │ opensend_transfers │  │
                    │  ├───────────────────┤  │
                    │  │ opensend_events   │  │
                    │  ├───────────────────┤  │
                    │  │ opensend_mcp_tok. │  │
                    │  ├───────────────────┤  │
                    │  │ Storage:          │  │
                    │  │ opensend-transfers│  │
                    │  └───────────────────┘  │
                    └─────────────────────────┘

AI Agent (Hermes, Claude Code, Cursor)
     │
     ▼
┌────────────────────┐
│  MCP Server        │
│  (stdio transport) │
│                    │
│  Tools:            │
│  list_my_transfers │
│  get_transfer      │
│  delete_transfer   │
│  export_history    │
└────────┬───────────┘
         │
         ▼
    Supabase (service role)
```

## Data Flow

### Upload
1. User drops file → FileDropzone component
2. POST /api/upload (multipart form) with auth cookie
3. Server verifies auth, validates file (size, name)
4. Uploads to Supabase Storage: `opensend-transfers/{userId}/{uuid}/{filename}`
5. Creates record in `opensend_transfers` (status: uploading → available)
6. Logs event to `opensend_transfer_events`
7. Returns share URL + claim code

### Download
1. Recipient visits `/t/{claimCode}`
2. Page calls GET /api/claim/{code} → returns metadata
3. User clicks download → GET /api/download/{code} → serves file
4. Server increments download_count, logs event

### Delete
1. Owner clicks delete on `/history`
2. DELETE /api/transfers/{id} with auth cookie
3. Server verifies ownership (user_id match)
4. Soft-deletes record (status: deleted, deleted_at set)
5. Removes file from Storage

## Database

All tables use `opensend_` prefix to coexist with the shared OpenSprout Supabase project.

See migrations in `supabase/migrations/`:
- `20260623000001_create_opensend_transfers.sql`
- `20260623000002_create_opensend_transfer_events.sql`
- `20260623000003_create_opensend_mcp_tokens.sql`
- `20260623000004_create_opensend_storage.sql`

## MCP Server

The MCP server (`apps/mcp/`) is a standalone Node.js process that connects via stdio JSON-RPC. It authenticates via SHA-256 hashed tokens stored in `opensend_mcp_tokens`, then uses the service role for all queries with explicit `user_id` filtering.

## Security

- Service role only used server-side (API routes, MCP)
- Every query filters by `user_id` — no RLS bypass can leak data
- Every mutation has an ownership pre-check
- SHA-256 hashed share tokens and MCP tokens
- IP and User-Agent hashed (not stored raw) for abuse tracking
