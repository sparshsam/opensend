/**
 * Platform-agnostic fetch wrapper for OpenSend.
 *
 * In Capacitor builds (file:// protocol), API calls use the production URL.
 * In web/server mode, they use relative paths (/api/...).
 *
 * Also provides a one-time setup that patches window.fetch for API routes
 * so existing code using direct fetch() continues to work in Capacitor.
 */

const CAPACITOR_API_BASE = "https://send.kovina.org";

function getApiBase(): string {
  if (typeof window !== "undefined" && window.location.protocol === "file:") {
    return CAPACITOR_API_BASE;
  }
  return "";
}

export async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  const base = getApiBase();
  const url = base ? `${base}${path}` : path;
  return fetch(url, options);
}

/**
 * Patch window.fetch so that any request to /api/* is automatically
 * redirected to the production server when running from file:// protocol.
 *
 * Call this once at app startup (in layout.tsx).
 */
export function setupCapacitorFetch() {
  if (typeof window === "undefined") return;
  if (window.location.protocol !== "file:") return;
  if ((window as any).__opensend_fetch_patched) return;
  (window as any).__opensend_fetch_patched = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = function patchedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    // Only patch /api/* and /auth/* routes
    if (url.startsWith("/api/") || url.startsWith("/auth/")) {
      return originalFetch(`${CAPACITOR_API_BASE}${url}`, init);
    }
    return originalFetch(input, init);
  };
}
