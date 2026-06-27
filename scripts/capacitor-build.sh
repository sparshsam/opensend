#!/bin/bash
# Capacitor build script for OpenSend
# Temporarily moves API routes out of the build path since Capacitor
# uses api-fetch.ts to call the production API directly.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
API_STASH_DIR="/tmp/opensend-api-stash"

cd "$PROJECT_DIR"

echo "=== OpenSend Capacitor Build ==="

# 1. Move API routes out of the build path
echo "Stashing API routes..."
mkdir -p "$API_STASH_DIR"
for f in $(find src/app/api -name "route.ts"); do
  rel="${f#src/app/}"
  mkdir -p "$(dirname "$API_STASH_DIR/$rel")"
  mv "$f" "$API_STASH_DIR/$rel"
done
# Also stash auth/callback (it's an API-like route)
if [ -f src/app/auth/callback/route.ts ]; then
  mkdir -p "$API_STASH_DIR/auth/callback"
  mv src/app/auth/callback/route.ts "$API_STASH_DIR/auth/callback/route.ts"
fi

# Also stash dynamic page routes not needed in native app
if [ -f src/app/t/\[code\]/page.tsx ]; then
  mkdir -p "$API_STASH_DIR/t/\[code\]"
  mv src/app/t/\[code\]/page.tsx "$API_STASH_DIR/t/\[code\]/page.tsx"
fi

# 2. Run next build with static export
echo "Building Next.js static export..."
CAPACITOR_BUILD=true npx next build

# 3. Restore API routes and stashed pages
echo "Restoring stashed files..."
for f in $(find "$API_STASH_DIR" -name "route.ts" -o -name "page.tsx"); do
  rel="${f#$API_STASH_DIR/}"
  mkdir -p "$(dirname "$PROJECT_DIR/src/app/$rel")"
  mv "$f" "$PROJECT_DIR/src/app/$rel"
done
rm -rf "$API_STASH_DIR"

# 4. Copy to Android
echo "Copying to Android..."
npx cap copy android

# 5. Build Android APK
echo "Building Android APK..."
export ANDROID_HOME=${ANDROID_HOME:-/mnt/c/Users/spars/AppData/Local/Android/Sdk}
cd android && ./gradlew assembleDebug

echo "=== Build Complete ==="
echo "APK location: android/app/build/outputs/apk/debug/"
