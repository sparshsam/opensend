/**
 * Native Google Sign-In for Capacitor Android.
 *
 * Uses @codetrix-studio/capacitor-google-auth to retrieve a Google ID token
 * via Android's native account picker, then exchanges it with Supabase
 * via signInWithIdToken().
 *
 * ── Manual setup required (you) ────────────────────────────────
 * See SETUP_NOTES at the bottom of this file.
 * ───────────────────────────────────────────────────────────────
 */

import { GoogleAuth } from "@codetrix-studio/capacitor-google-auth";
import type { SupabaseClient } from "@supabase/supabase-js";
import { trackIdTokenReceived, trackAuthError } from "@/lib/auth-diag";

// ── Detection ──

/** Whether the Capacitor Google Auth plugin is available (native Android only). */
export function isNativeAuthAvailable(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof (window as any).Capacitor === "undefined") return false;
  // The plugin registers itself; if the import resolved it's present.
  return true;
}

/** Whether the Capacitor Google Auth plugin is actually configured (clientId set). */
export function isNativeAuthConfigured(): boolean {
  if (!isNativeAuthAvailable()) return false;
  try {
    const cfg = (window as any).Capacitor?.config?.plugins?.GoogleAuth;
    return !!(cfg?.clientId);
  } catch {
    return false;
  }
}

// ── Sign-In ──

/**
 * Sign in with Google using the native Android account picker.
 *
 * 1. GoogleAuth.signIn() → shows the phone's Google account picker
 * 2. Returns an idToken via the plugin
 * 3. Exchanges the idToken with Supabase (creates/links user)
 *
 * Throws if the plugin is unavailable or the exchange fails.
 */
export async function nativeGoogleSignIn(supabase: SupabaseClient): Promise<void> {
  if (!isNativeAuthConfigured()) {
    throw new Error(
      "Native Google sign-in is not configured. " +
      "Add clientId to capacitor.config.ts under plugins.GoogleAuth. " +
      "See the Setup Notes at the bottom of src/lib/native-google-auth.ts."
    );
  }

  // Step 1: Native account picker → idToken
  const user = await GoogleAuth.signIn();

  if (!user.authentication?.idToken) {
    const msg = "Google sign-in did not return an ID token. Try again.";
    trackAuthError(msg);
    throw new Error(msg);
  }

  trackIdTokenReceived();

  // Step 2: Exchange the idToken with Supabase
  const { error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: user.authentication.idToken,
  });

  if (error) {
    trackAuthError(error.message);
    throw error;
  }

  // (No need to call GoogleAuth.signOut — the plugin keeps the session alive.)
}

// ── Sign-Out ──

/**
 * Sign out from both Google and Supabase.
 */
export async function nativeGoogleSignOut(supabase: SupabaseClient): Promise<void> {
  try {
    await GoogleAuth.signOut();
  } catch {
    // Plugin logout is best-effort; proceed with Supabase logout anyway.
  }
  await supabase.auth.signOut();
}

/* ═══════════════════════════════════════════════════════════════
   SETUP NOTES – do these once before testing native sign-in

   1. Google Cloud Console — Create OAuth 2.0 credentials:
      ─ Application type: Android
      ─ Package name:  org.kovina.opensend
      ─ SHA-1 fingerprint: run this in your terminal:
          cd android && ./gradlew signingReport | grep SHA1 | head -1
        (or use the debug keystore):
          keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey \
            -storepass android -keypass android 2>/dev/null | grep SHA1

   2. Add the WEB client ID to capacitor.config.ts:
      ─ Create a Web application OAuth 2.0 client ID in Google Cloud Console
        (Authorized JavaScript origins: http://localhost, https://send.kovina.org)
      ─ Add it to capacitor.config.ts under:
          plugins.GoogleAuth.clientId: "<web-client-id>.apps.googleusercontent.com"

   3. The Android OAuth client (from step 1) handles native auth.
      The Web OAuth client (from step 2) provides the idToken format
      that Supabase expects. Both are needed.

   4. Sync and rebuild:
      npx cap sync android
      bash scripts/capacitor-build.sh

   ═══════════════════════════════════════════════════════════════ */
