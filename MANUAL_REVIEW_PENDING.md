# Manual Review — Pending Tasks

Tasks that require manual intervention (testing, credentials, account setup, or real-device verification).

---

## Deployment

- [ ] **Vercel deploy**: Free-tier daily deploy limit hit (100/day). Run `npx vercel --prod --yes` from WSL (`/home/spars/repos/opensend/`) when limit resets (midnight UTC). Or upgrade to Vercel Pro ($20/mo) to remove the cap.
- [ ] **Set `CRON_SECRET` env var**: The cleanup cron at `/api/cron/cleanup` is auth-guarded. Set `CRON_SECRET` in Vercel project env vars, then verify the cron fires correctly.
- [ ] **Enable Vercel Cron Jobs**: `vercel.json` schedules cleanup every 15 min. Vercel Pro plan required for cron jobs — on Hobby plan this runs as a manual API endpoint only (hit `GET /api/cron/cleanup` with `Authorization: Bearer <CRON_SECRET>`).

---

## Android (Capacitor)

- [ ] **Run first debug build**: `CAPACITOR_BUILD=true npm run build && npx cap copy android && cd android && ./gradlew assembleDebug` — verify it compiles.
- [ ] **Generate upload keystore**: `keytool -genkey -v -keystore android/app/keystores/upload-keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias opensend`
- [ ] **Create `android/keystore.properties`**: With `storeFile`, `storePassword`, `keyAlias`, `keyPassword`.
- [ ] **Add signing config to build.gradle**: Add `signingConfigs.release` block pointing to the keystore properties.
- [ ] **Run release AAB build**: `npm run android:release` — produces `android/app/build/outputs/bundle/release/app-release.aab`.
- [ ] **Create Google Play Console listing**: Upload AAB to internal/closed test track.
- [ ] **Test on real Android device**: File transfer, QR scanning, camera permissions, share intent.
- [ ] **Test deep links**: `opensend://` scheme and `https://send.kovina.org` URLs.

---

## Windows (Electron)

- [ ] **Install Electron dependencies**: `cd apps/desktop && npm install` — downloads Electron binary (~150MB).
- [ ] **Build Next.js static export**: `npm run build` — produces `out/` directory.
- [ ] **Run debug Electron build**: `npm run desktop:start` — launches the app window.
- [ ] **Generate code signing certificate**: Required to avoid SmartScreen "Unknown Publisher" warning on the installer.
- [ ] **Build release installer**: `npm run desktop:build` — produces NSIS installer, portable EXE, and MSIX in `dist/desktop/`.
- [ ] **Create Microsoft Store listing**: For MSIX submission.
- [ ] **Test on real Windows device**: File dialog, drag-drop, .opensend file association, auto-update.

---

## Supabase / Database

- [ ] **Review RLS policies**: Ensure all `opensend_*` tables have appropriate Row Level Security. The admin client (service role) is used in API routes, so RLS is bypassed — ownership checks are done at the application layer. Verify this is correct for each table.
- [ ] **Add `is_favorite` column**: If not present on `opensend_transfers` table, add it: `ALTER TABLE opensend_transfers ADD COLUMN is_favorite BOOLEAN DEFAULT false;`
- [ ] **Check `opensend_guest_signals` table**: The cleanup cron deletes signals >1h old. Verify the table and index exist.
- [ ] **Run `supabase db push`** if any new migrations were added.

---

## Security

- [ ] **Run `npm audit`**: Before next production release, check for dependency vulnerabilities.
- [ ] **Review CSP**: The Content-Security-Policy in middleware is restrictive. After deploy, verify no console errors about blocked resources.
- [ ] **Verify security headers**: Use `curl -sI https://send.kovina.org | grep -i "strict-transport-security\|content-security-policy\|x-frame-options"` to confirm headers are served.
- [ ] **Run penetration testing checklist**: See `docs/security.md` for the full 22-item checklist.
- [ ] **Set up monitoring**: Consider adding Sentry or similar for error tracking in production.

---

## MCP / API

- [ ] **MCP endpoint test**: Since code is not deployed yet (deploy blocked), cannot verify MCP tools work on production. Run: `curl -s -H "Authorization: Bearer <token>" -d '{"jsonrpc":"2.0","method":"tools/list","id":1}' https://send.kovina.org/api/mcp`
- [ ] **Profile MCP prompt box**: Verify the agent setup prompt renders correctly with the endpoint, token, and JSON config.

---

## Manual Testing (Real Devices)

- [ ] **Web (desktop browser)**: Send → Receive flow with QR/code, file transfer, completion receipt, download.
- [ ] **Web (mobile Safari/Chrome)**: File picker via `<label>` element, WebRTC connection, download on iOS.
- [ ] **PWA install**: Test Install Prompt on Chrome desktop and Android.
- [ ] **Multi-file batch**: 2+ files, verify all arrive, check order and integrity.
- [ ] **Cloud fallback**: When direct transfer fails, verify "Switch to Cloud Transfer" button works.
- [ ] **Cancel flow**: Start a transfer, cancel it, verify both sides show cancelled state.
- [ ] **Expired session**: Create a session, wait 15 min, verify receiver sees "Session expired".
- [ ] **Sign-in flow**: Google OAuth, trusted device registration, MCP token creation/revocation.
- [ ] **Guest flows**: No sign-in required, pair codes, QR join, completion without account.
- [ ] **Diagnostics page**: Copy diagnostics button works, contains useful info.

---

## Post-Deploy

- [ ] **Verify `send.kovina.org` loads**: HTTP 200, SSL valid, no mixed content warnings.
- [ ] **Check OG image**: Share link to `https://send.kovina.org` in Slack/Discord — does the preview render?
- [ ] **Check favicon**: Browser tab shows the purple OpenSend arrow icon.
- [ ] **Check PWA manifest and service worker**: Chrome DevTools → Application → Manifest / Service Workers.
- [ ] **Verify iOS splash screens**: Add to home screen on iPhone, check startup shows the icon on purple background.
- [ ] **Check `/profile` page**: Signed in = shows account info, trusted devices, MCP tokens, sync. Signed out = shows guest mode status with sign-in prompt.
