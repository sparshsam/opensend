#!/bin/bash
# Capacitor build script for OpenSend
# Temporarily moves API routes out of the build path since Capacitor
# uses api-fetch.ts to call the production API directly.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
STASH_DIR="/tmp/opensend-build-stash"

cd "$PROJECT_DIR"

echo "=== OpenSend Capacitor Build ==="

# 1. Move dynamic routes out of the build path (API routes + dynamic pages)
echo "Stashing dynamic routes..."
mkdir -p "$STASH_DIR"

# Stash API routes
find src/app/api -name "route.ts" -print0 | while IFS= read -r -d '' f; do
  rel="${f#src/app/}"
  target_dir="$STASH_DIR/$(dirname "$rel")"
  mkdir -p "$target_dir"
  mv "$f" "$target_dir/"
done

# Stash auth/callback (API-like route)
if [ -f "src/app/auth/callback/route.ts" ]; then
  mkdir -p "$STASH_DIR/auth/callback"
  mv src/app/auth/callback/route.ts "$STASH_DIR/auth/callback/route.ts"
fi

# Stash t/[code]/page.tsx (dynamic page not needed in native app)
PAGE_FILE=$(find src/app/t -name "page.tsx" -path "*/t/*" 2>/dev/null || true)
if [ -n "$PAGE_FILE" ] && [ -f "$PAGE_FILE" ]; then
  rel="${PAGE_FILE#src/app/}"
  mkdir -p "$STASH_DIR/$(dirname "$rel")"
  mv "$PAGE_FILE" "$STASH_DIR/$rel"
  echo "Stashed: $rel"
fi

# 2. Inject build info and run next build
echo "Building Next.js static export..."
BUILD_COMMIT=$(git rev-parse --short HEAD)
BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
sed -i "s/__BUILD_COMMIT__/$BUILD_COMMIT/g; s/__BUILD_TIME__/$BUILD_TIME/g" src/lib/api-fetch.ts
CAPACITOR_BUILD=true npx next build
# Restore placeholders after build
git checkout -- src/lib/api-fetch.ts

# 3. Restore stashed files
echo "Restoring stashed files..."
if [ -d "$STASH_DIR" ]; then
  find "$STASH_DIR" -type f -print0 | while IFS= read -r -d '' f; do
    rel="${f#$STASH_DIR/}"
    target_dir="$PROJECT_DIR/src/app/$(dirname "$rel")"
    mkdir -p "$target_dir"
    mv "$f" "$target_dir/"
  done
  rm -rf "$STASH_DIR"
fi

# 4. Copy to Android
echo "Copying to Android..."
npx cap copy android

# 5. Build Android APK
echo "Building Android APK..."
export ANDROID_HOME=${ANDROID_HOME:-/mnt/c/Users/spars/AppData/Local/Android/Sdk}
cd android && ./gradlew assembleDebug

echo "=== Build Complete ==="
echo "APK location: android/app/build/outputs/apk/debug/"
