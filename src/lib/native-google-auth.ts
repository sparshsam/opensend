/**
 * Native Google Sign-In for Capacitor Android.
 *
 * Uses @capacitor/browser (Chrome Custom Tab) to open the Supabase OAuth
 * URL in-app, then catches the redirect via the appUrlOpen deep-link event.
 *
 * ── Manual setup required (you) ──────────────────────────────────
 * 1. Add to Supabase Auth settings → allowed redirect URLs:
 *    opensend://auth/callback
 * 2. AndroidManifest.xml already has the opensend:// deep link
 * 3. No changes needed in Google Cloud Console — the existing
 *    Web OAuth client handles this flow.
 * ──────────────────────────────────────────────────────────────────
 */

import { Browser } from "@capacitor/browser";
import { App } from "@capacitor/app";
import type { SupabaseClient } from "@supabase/supabase-js";
import { trackAuthError } from "@/lib/auth-diag";

// ── Detection ──

/** Whether the Capacitor Browser plugin is available (native Android only). */
export function isNativeAuthAvailable(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof (window as any).Capacitor === "undefined") return false;
  return typeof (window as any).Capacitor?.Plugins?.Browser !== "undefined";
}

/**
 * Whether the native browser-based auth is configured.
 * Always true when running natively — the deep link scheme is baked into
 * the app manifest.
 */
export function isNativeAuthConfigured(): boolean {
  return isNativeAuthAvailable();
}

// ── Diagnostic helpers ──

/** Read native auth diagnostics — never throws. */
export function getNativeAuthDiag() {
  try {
    const cap = (window as any).Capacitor;
    const rawConfig = cap?.config || {};
    const rawPlugins = rawConfig?.plugins || {};
    const hasBrowserPlugin = typeof cap?.Plugins?.Browser !== "undefined";
    return {
      hasCapacitor: typeof cap !== "undefined",
      hasBrowserPlugin,
      configHasPlugins: typeof rawPlugins === "object" && Object.keys(rawPlugins).length > 0,
      configPluginKeys: Object.keys(rawPlugins).join(", ") || "(none)",
      clientIdInConfig: false,
      clientIdSuffix: "(browser-based auth — no clientId needed)",
      rawConfigJson: JSON.stringify(rawConfig).slice(0, 300),
    };
  } catch (e: any) {
    return {
      hasCapacitor: false,
      hasBrowserPlugin: false,
      configHasPlugins: false,
      configPluginKeys: `(error: ${e.message})`,
      clientIdInConfig: false,
      clientIdSuffix: "(error)",
      rawConfigJson: "(error)",
    };
  }
}

// ── Auth stage tracking ──

let _authStage = "idle";

export function getAuthStage(): string { return _authStage; }
export function resetAuthStage(): void { _authStage = "idle"; }
function setStage(s: string) { _authStage = s; console.log(`[auth] stage: ${s}`); }

// ── Sign-In ──

/**
 * Sign in with Google using the in-app Chrome Custom Tab flow.
 *
 * 1. Generate OAuth URL via Supabase (with skipBrowserRedirect)
 * 2. Open in Chrome Custom Tab (stays in app)
 * 3. Listen for opensend://auth/callback deep link
 * 4. Exchange PKCE code for Supabase session
 * 5. Close the browser tab
 */
export async function nativeGoogleSignIn(supabase: SupabaseClient): Promise<void> {
  if (!isNativeAuthConfigured()) {
    throw new Error("Native sign-in is not available on this device.");
  }

  setStage("creating-auth-url");

  // Step 1: Get the OAuth URL from Supabase (don't auto-redirect)
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: "opensend://auth/callback",
      skipBrowserRedirect: true,
    },
  });

  if (error) {
    trackAuthError(error.message);
    setStage("auth-url-failed");
    throw error;
  }

  if (!data?.url) {
    const msg = "Failed to create auth URL";
    trackAuthError(msg);
    setStage("auth-url-failed");
    throw new Error(msg);
  }

  setStage("browser-open");

  // Step 2: Listen for the deep-link callback BEFORE opening the tab
  const callbackPromise = new Promise<string>((resolve, reject) => {
    const handler = App.addListener("appUrlOpen", (event: { url: string }) => {
      const url = event.url;
      if (url.startsWith("opensend://auth/callback")) {
        setStage("app-url-open-received");
        handler.then((l) => l.remove());
        resolve(url);
      }
    });

    setTimeout(() => {
      handler.then((l) => l.remove());
      const msg = "Sign-in timed out waiting for callback";
      trackAuthError(msg);
      setStage("timeout");
      reject(new Error(msg));
    }, 300_000);
  });

  try {
    // Step 3: Open the auth URL in a Chrome Custom Tab
    await Browser.open({ url: data.url });

    // Step 4: Wait for the callback deep-link
    const callbackUrl = await callbackPromise;
    setStage("callback-url-received");

    // Step 5: Close the browser tab
    await Browser.close().catch(() => {});
    setStage("browser-closed");

    // Step 6: Exchange the PKCE code for a session
    const params = new URL(callbackUrl).searchParams;
    const code = params.get("code");

    if (code) {
      setStage("exchanging-code");
      await supabase.auth.exchangeCodeForSession(callbackUrl);
      setStage("session-exchange-success");
    } else {
      const msg = "No auth code found in callback URL";
      trackAuthError(msg);
      setStage("no-code-in-callback");
      throw new Error(msg);
    }
  } catch (err) {
    await Browser.close().catch(() => {});
    const msg = err instanceof Error ? err.message : "Sign-in failed";
    trackAuthError(msg);
    setStage("failed");
    throw err;
  }
}

// ── Sign-Out ──

export async function nativeGoogleSignOut(supabase: SupabaseClient): Promise<void> {
  await supabase.auth.signOut();
}
