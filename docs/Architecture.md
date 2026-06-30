# Architecture

> The existing architecture documentation has been consolidated from the original README and `docs/architecture.md`.

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

## Project Structure

```
src/
├── app/page.tsx         Home (Send / Receive cards)
├── app/send/            Send flow (file pick, method, QR + code, transfer)
├── app/receive/         Receive flow (QR info, pair code entry, download)
├── app/t/[code]/        Download by claim code
├── app/history/         Transfer history (signed-in users)
├── app/profile/         Profile + MCP tokens
├── app/privacy/         Privacy policy
├── app/terms/           Terms of service
├── app/support/         Support + FAQ
├── app/api/upload/      Upload endpoint
├── app/api/download/    File download
├── app/api/claim/       Claim code lookup
├── app/api/transfers/   Transfer CRUD
├── app/api/auth/token/  MCP token management
├── components/          UI kit (playbook-compliant)
└── lib/supabase/        Supabase clients

apps/mcp/                MCP server (standalone Supabase MCP server)
apps/desktop/            Electron desktop wrapper
supabase/migrations/     Database schema
docs/                    Documentation
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
└──────────────────┘     └──────────────────┘
         │                       │
         ▼                       ▼
┌─────────────────────────────────────────────┐
│             Supabase                        │
│  Postgres (Database)  +  Storage (Files)    │
│  Auth (GitHub OAuth)  +  Realtime           │
└─────────────────────────────────────────────┘
         │
         ▼
┌──────────────────┐
│  MCP Server      │
│  (AI Agent API)  │
└──────────────────┘
```

## Transfer Flows

### Direct Transfer (WebRTC P2P)
1. Sender selects files, picks Direct Transfer
2. A QR code and 6-character pairing code are generated
3. Receiver scans QR or enters code
4. WebRTC peer connection established
5. Files transfer directly between devices — no cloud storage

### Cloud Transfer (Temporary Upload)
1. Sender selects files, picks Cloud Transfer
2. Files upload to Supabase Storage
3. A claim code is generated
4. Receiver enters claim code
5. Files download from Supabase Storage
6. Files expire and are deleted after the retention period

## MCP Server

OpenSend includes an MCP server for AI agent integration with 4 tools:

| Tool | Description |
|------|-------------|
| `list_my_transfers` | List transfers with status/pagination |
| `get_transfer` | Full details by ID |
| `delete_transfer` | Soft-delete with ownership check |
| `export_transfer_history` | Full export (active/expired/deleted) |

## Additional Architecture Resources

- [Shared Supabase Project](supabase-shared-project.md)
- [Transfer Methods](transfer-methods.md)
- [WebRTC Architecture](webrtc-architecture.md)
- [Pairing System](pairing.md)
- [TURN Setup](turn-setup.md)
- [Privacy & Abuse](privacy-and-abuse.md)
