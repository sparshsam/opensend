# Testing

## Running Tests

```bash
# MCP server tests
cd apps/mcp && npm test

# Type checking
npm run typecheck

# Linting
npm run lint

# Build verification
npm run build
```

## Before Submitting a PR

1. Run all checks:
   ```bash
   npm run typecheck
   npm run lint
   npm run build
   cd apps/mcp && npm run typecheck && npm test
   ```
2. Keep changes focused — one feature per PR
3. Update CHANGELOG.md
