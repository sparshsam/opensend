/**
 * Platform-agnostic fetch wrapper for OpenSend.
 *
 * In Capacitor / native builds, API calls use the production URL.
 * In web/server mode, they use relative paths (/api/...).
 *
 * Native detection signals (any one triggers production routing):
 *   - window.Capacitor.isNativePlatform() === true   (Capacitor bridge)
 *   - window.location.origin === "https://localhost"  (Capacitor 8 androidScheme: https)
 *   - hostname localhost + userAgent "; wv)"          (Android WebView heuristic)
 *   - window.location.protocol === "file:"            (legacy Capacitor)
 */

const API_ORIGIN = "https://send.kovina.org";

/** Current build info — set by build script */
export const BUILD_COMMIT = "__BUILD_COMMIT__";
export const BUILD_TIME = "__BUILD_TIME__";

// ── Native platform detection ───────────────────────────────────────────────

/**
 * Returns true when the code is running inside a native app shell
 * (Capacitor / Android WebView) where relative `/api/` paths must be
 * resolved against the production API origin instead of localhost.
 */
export function isNativePlatform(): boolean {
  if (typeof window === "undefined") return false;

  // 1. Capacitor bridge (most authoritative)
  if ((window as any).Capacitor?.isNativePlatform?.() === true) return true;

  // 2. Capacitor 8 with androidScheme: "https" serves from https://localhost
  if (window.location.origin === "https://localhost") return true;

  // 3. Android WebView user-agent pattern (localhost + "; wv)")
  if (
    window.location.hostname === "localhost" &&
    navigator.userAgent.includes("; wv)")
  ) {
    return true;
  }

  // 4. Legacy Capacitor file:// protocol
  if (window.location.protocol === "file:") return true;

  return false;
}

/**
 * Resolve an API path to an absolute URL.
 * In native builds prepends the production origin; in web mode returns
 * the relative path as-is.
 */
function resolveApiUrl(path: string): string {
  return isNativePlatform() ? `${API_ORIGIN}${path}` : path;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Fetch with automatic base-URL resolution for native builds.
 * Always use this instead of raw fetch() for API calls.
 */
export async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  const url = resolveApiUrl(path);
  if (isNativePlatform() && typeof console !== "undefined") {
    console.log(`[apiFetch] ${path} → ${url}`);
  }
  return fetch(url, options);
}

/**
 * Resolve a URL for display / debug without making a request.
 */
export function resolveApiUrlForDisplay(path: string): string {
  return resolveApiUrl(path);
}

/**
 * Safe JSON fetch: extracts JSON from an API response with guard rails.
 *
 * - Throws if response is not ok (non-2xx)
 * - Throws if content-type is not application/json (e.g. HTML error page)
 * - Throws if JSON parsing fails
 *
 * Error messages always show the **final resolved URL**, not the original path.
 *
 * Use this for every API call that expects JSON.
 */
export async function apiFetchJson(path: string, options?: RequestInit): Promise<any> {
  const url = resolveApiUrl(path);
  const res = await fetch(url, options);

  const contentType = res.headers.get("content-type") || "";

  if (!res.ok) {
    let body = "";
    try {
      body = await res.text();
    } catch {}
    throw new Error(`API ${res.status} ${res.statusText} — ${url}: ${body.slice(0, 200)}`);
  }

  if (!contentType.includes("application/json")) {
    const body = await res.text().catch(() => "");
    const preview = body.replace(/\s+/g, " ").trim().slice(0, 120);
    throw new Error(`Expected JSON from ${url}, got ${contentType || "unknown"}: ${preview}`);
  }

  try {
    return await res.json();
  } catch (err: any) {
    const text = await res.text().catch(() => "");
    throw new Error(`JSON parse error on ${url}: ${err.message} — body: ${text.slice(0, 200)}`);
  }
}

/**
 * Patch window.fetch so that any request to /api/* or /auth/* is
 * automatically redirected to production when inside a native shell.
 * Call from a useEffect in a client component as a safety net.
 */
export function setupCapacitorFetch() {
  if (typeof window === "undefined") return;
  if (!isNativePlatform()) return;
  if ((window as any).__opensend_fetch_patched) return;
  (window as any).__opensend_fetch_patched = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = function patchedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("/api/") || url.startsWith("/auth/")) {
      const resolved = `${API_ORIGIN}${url}`;
      console.log(`[fetch-patch] ${url} → ${resolved}`);
      return originalFetch(resolved, init);
    }
    return originalFetch(input, init);
  };
}
