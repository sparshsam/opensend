<div align="center">
  <img src="public/icon.svg" alt="OpenSend" width="80" height="80" />
  <h1 align="center">OpenSend</h1>
  <p align="center">
    <strong>Free · Ad-free · Open-source file sharing</strong>
    <br />
    A clean alternative to SHAREit, Send Anywhere, and WeTransfer.
    <br />
    Upload a file. Get a link. Share it. Done.
  </p>

  [![Build](https://img.shields.io/github/actions/workflow/status/sparshsam/opensend/ci.yml?branch=main&style=flat-square&label=build&color=2563eb)](https://github.com/sparshsam/opensend/actions)
  [![License](https://img.shields.io/github/license/sparshsam/opensend?style=flat-square&color=2563eb)](LICENSE)
  [![Version](https://img.shields.io/github/v/release/sparshsam/opensend?style=flat-square&color=2563eb)](https://github.com/sparshsam/opensend/releases)
  [![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js)](https://nextjs.org)
  [![Supabase](https://img.shields.io/badge/Supabase-2.x-3fcf8e?style=flat-square&logo=supabase)](https://supabase.com)
  [![Vercel](https://img.shields.io/badge/Vercel-deployed-black?style=flat-square&logo=vercel)](https://opensend.vercel.app)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?style=flat-square&logo=typescript)](https://typescriptlang.org)

  **[opensend.vercel.app](https://opensend.vercel.app)** · **[GitHub](https://github.com/sparshsam/opensend)**
</div>

## Features

- **Upload & share** — files up to 50 MB
- **Share link** or **claim code** — download from any device
- **Auto-expires** 24 hours — nothing stored forever
- **Manual delete** — remove files early
- **Download tracking** — see how many times your file was downloaded
- **No account required** to download — just the code
- **GitHub OAuth** — optional sign-in for transfer history
- **MCP server** — AI agents can manage your transfers
- **PWA-ready** — install as an app on your phone

## Quick Start

```bash
git clone https://github.com/sparshsam/opensend
cd opensend
npm install
cd apps/mcp && npm install && cd ../..
cp .env.example .env.local  # add your Supabase keys
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Architecture

```
src/               Next.js 15 App Router
├── app/page.tsx        Upload terminal (home)
├── app/t/[code]/       Download by claim code
├── app/history/        Transfer history (signed-in users)
├── app/profile/        Profile + MCP tokens
├── app/privacy/        Privacy policy
├── app/terms/          Terms of service
├── app/support/        Support + FAQ
├── app/api/upload/     Upload endpoint
├── app/api/download/   File download
├── app/api/claim/      Claim code lookup
├── app/api/transfers/  Transfer CRUD
├── app/api/auth/token/ MCP token management
├── components/         UI kit (playbook-compliant)
└── lib/supabase/       Supabase clients

apps/mcp/            MCP server (standalone Supabase MCP server)
supabase/migrations/ Database schema
docs/                Documentation
```

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 15 (App Router) |
| Styling | Tailwind CSS 4 + Design Playbook |
| Auth | Supabase Auth (GitHub OAuth) |
| Database | Supabase Postgres (shared project with OpenSprout) |
| Storage | Supabase Storage (private, 50 MB limit) |
| MCP | @modelcontextprotocol/sdk v1 |
| Deploy | Vercel |

## Design

OpenSend is designed as a **transfer terminal** — not a dashboard. Every screen has one purpose. Built with the [Design Playbook](DESIGN_PLAYBOOK.md):

- Dark-mode first, true black canvas
- Pill buttons (`rounded-full`)
- Editorial typography (`font-black` hierarchy)
- No cards, no dashboard widgets
- Receipt/ticket pattern for results

Brand color: `#2563EB` — rich action blue.

## MCP Server

OpenSend includes an MCP server for AI agent integration with 4 tools:

| Tool | Description |
|------|-------------|
| `list_my_transfers` | List transfers with status/pagination |
| `get_transfer` | Full details by ID |
| `delete_transfer` | Soft-delete with ownership check |
| `export_transfer_history` | Full export (active/expired/deleted) |

[Setup guide](docs/architecture.md#mcp-server)

## Documentation

- [Architecture](docs/architecture.md)
- [Shared Supabase Project](docs/supabase-shared-project.md)
- [Store Readiness](docs/store-readiness.md)
- [Release Checklist](docs/release-checklist.md)
- [Privacy & Abuse](docs/privacy-and-abuse.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)

## Deployment

```bash
npm run build
npx vercel --prod
```

Environment variables required in Vercel:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## License

AGPLv3 — see [LICENSE](LICENSE)

Built by [@sparshsam](https://github.com/sparshsam)
