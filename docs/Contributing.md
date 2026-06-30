# Contributing

> This content has been moved from the root `CONTRIBUTING.md` for discoverability. See [CONTRIBUTING.md](../CONTRIBUTING.md) for the full guide.

## Quick Summary

### Pull Requests

1. Create a feature branch from `main`
2. Run all checks before submitting (see [Testing](Testing.md))
3. Keep changes focused — one feature per PR
4. Update CHANGELOG.md

### Code Style

- TypeScript strict mode
- Design Playbook: pill buttons, dark-first, no cards, editorial typography
- MCP Build Guide: snake_case tools, `.eq("user_id", userId)` on every query
- Prefixed tables: all OpenSend tables use `opensend_` prefix

### Commit Messages

```
<type>: <description>

feat:    new feature
fix:     bug fix
docs:    documentation
refactor: code restructure
test:    test additions/changes
```

### Gotchas

When multiple files are uploaded simultaneously, `opensend_batch_id` is shared across transfers. This is not enforced through constraints; ensure your feature accounts for this.

## License

By contributing, you agree that your contributions will be licensed under AGPLv3.
