# Release Checklist v0.1.2

## Pre-Release

- [ ] All migrations created and reviewed
- [ ] API routes tested with real Supabase
- [ ] MCP server typechecks and tests pass
- [ ] `npm run build` succeeds
- [ ] `npm run lint` clean
- [ ] CHANGELOG.md updated
- [ ] Version bumped in package.json, apps/mcp/package.json
- [ ] Docs updated (architecture, shared project, store readiness)

## Database

- [ ] Run migrations on Supabase production project
- [ ] Create `opensend-transfers` storage bucket
- [ ] Verify RLS policies work
- [ ] Test upload/download with a real file

## Deployment

- [ ] Set `NEXT_PUBLIC_SUPABASE_URL` in Vercel
- [ ] Set `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel
- [ ] Set `SUPABASE_SERVICE_ROLE_KEY` in Vercel
- [ ] Deploy to Vercel (`vercel --prod`)
- [ ] Verify production build at `opensend.vercel.app`

## Post-Release

- [ ] Tag release: `git tag v0.1.2 && git push --tags`
- [ ] Create GitHub release with changelog
- [ ] Test end-to-end flow on production
- [ ] Monitor logs for errors
