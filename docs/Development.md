# Development

## Prerequisites

- Node.js 20+
- npm
- A Supabase account (free tier works)
- Supabase project credentials (shared project with OpenSprout)

## Setup

```bash
git clone https://github.com/sparshsam/opensend
cd opensend
npm install
cd apps/mcp && npm install && cd ../..
cp .env.example .env.local  # Add your Supabase keys
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server-side only) |

## Running Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run lint` | Run linter |
| `npm run typecheck` | TypeScript type checking |
| `cd apps/mcp && npm test` | Run MCP server tests |
