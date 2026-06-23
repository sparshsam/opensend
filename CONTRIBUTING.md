# Contributing to OpenSend

## Development

```bash
# Setup
git clone https://github.com/sparshsam/opensend
cd opensend
npm install
cd apps/mcp && npm install && cd ../..
cp .env.example .env.local  # Add real Supabase keys
```

## Project Structure

```
src/               # Next.js App Router
apps/mcp/          # MCP server (standalone package)
supabase/          # Database migrations
docs/              # Documentation
```

## Pull Requests

1. Create a feature branch from `main`
2. Run all checks before submitting:
   ```bash
   npm run typecheck
   npm run lint
   npm run build
   cd apps/mcp && npm run typecheck && npm test
   ```
3. Keep changes focused — one feature per PR
4. Update CHANGELOG.md

## Code Style

- TypeScript strict mode
- Design Playbook: pill buttons, dark-first, no cards, editorial typography
- MCP Build Guide: snake_case tools, `.eq("user_id", userId)` on every query
- Prefixed tables: all OpenSend tables use `opensend_` prefix

## Commit Messages

```
<type>: <description>

feat:    new feature
fix:     bug fix
docs:    documentation
refactor: code change with no behavior change
chore:   build, CI, tooling
```

## Documentation

When adding features, update:
- README.md (if user-facing)
- docs/architecture.md (if structural)
- CHANGELOG.md (always)
