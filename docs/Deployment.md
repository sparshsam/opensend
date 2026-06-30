# Deployment

## Vercel

The app deploys to Vercel (server-rendered Next.js).

```bash
npm run build
npx vercel --prod
```

### Required Environment Variables

Set these in your Vercel project dashboard:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Desktop (Windows)

An Electron desktop build is available:

```bash
npm run desktop:install
npm run desktop:build
```

Produces NSIS installer, portable EXE, and MSIX package for Microsoft Store.

## Android

Build the Capacitor Android app:

```bash
npm run android:build    # Debug APK
npm run android:release  # Signed AAB
```

## Additional Resources

- [Store Readiness](store-readiness.md)
- [Release Checklist](release-checklist.md)
- [Security Review](security-review-v0.2.4.md)
