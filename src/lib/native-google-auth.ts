/**
 * Native Google Sign-In for Capacitor Android.
 *
 * Uses @capacitor/browser (Chrome Custom Tab) to open the Supabase OAuth
 * URL in-app, then catches the redirect via the appUrlOpen event.
 *
 * ── Manual setup required (user) ──────────────────────────────────
 * 1. Add the custom scheme redirect to Supabase Auth settings:
 *    opensend://auth/callback
 * 2. (Optional) Configure Google Cloud Console OAuth for Android
 *    with your app's SHA-1 fingerprint if using Google Identity
 *    Platform enhanced protection.
 * ──────────────────────────────────────────────────────────────────
 */

import { Browser } from "@capacitor/browser";
import { App } from "@capacitor/app";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Whether the Capacitor Browser plugin is available (native only). */
export function isNativeAuthAvailable(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof (window as any).Capacitor === "undefined") return false;
  return true;
}

/**
 * Open the Supabase Google OAuth URL in a Chrome Custom Tab and
 * wait for the auth callback deep-link to return.
 *
 * The resolved URL can be passed to supabase.auth.exchangeCodeForSession()
 * if PKCE is used, or the onAuthStateChange listener picks up the session.
 *
 * @param supabase - Initialized Supabase client
 * @param authUrl  - The OAuth URL from supabase.auth.signInWithOAuth()
 */
export async function signInWithNativeGoogle(
  supabase: SupabaseClient,
  authUrl: string,
): Promise<void> {
  // Listen for the deep-link callback BEFORE opening the tab
  // to avoid race conditions.
  const callbackPromise = new Promise<string>((resolve, reject) => {
    const handler = App.addListener("appUrlOpen", (event: { url: string }) => {
      const url = event.url;
      if (url.startsWith("opensend://auth/callback")) {
        handler.then((l) => l.remove());
        resolve(url);
      }
    });

    // Timeout: if the user doesn't complete auth in 5 min, abort
    setTimeout(() => {
      handler.then((l) => l.remove());
      reject(new Error("Sign-in timed out"));
    }, 300_000);
  });

  try {
    // Open the auth URL in a Chrome Custom Tab
    await Browser.open({ url: authUrl, windowName: "_self" });

    // Wait for the callback deep-link
    const callbackUrl = await callbackPromise;

    // Close the browser tab
    await Browser.close();

    // Exchange the PKCE code for a session.
    // The callback URL contains the auth code fragments.
    const params = new URL(callbackUrl).searchParams;
    const code = params.get("code");
    if (code) {
      await supabase.auth.exchangeCodeForSession(callbackUrl);
    }
  } catch (err) {
    await Browser.close().catch(() => {});
    throw err;
  }
}
