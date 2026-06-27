/**
 * Platform-agnostic fetch wrapper for OpenSend.
 *
 * In Capacitor builds (file:// protocol), API calls use the production URL.
 * In web/server mode, they use relative paths (/api/...).
 */

const CAPACITOR_API_BASE = "https://send.kovina.org";

function getApiBase(): string {
  if (typeof window !== "undefined" && window.location.protocol === "file:") {
    return CAPACITOR_API_BASE;
  }
  return "";
}

/**
 * Fetch with automatic base URL for Capacitor builds.
 * Always use this instead of raw fetch() for API calls.
 */
export async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  const base = getApiBase();
  const url = base ? `${base}${path}` : path;
  return fetch(url, options);
}

/**
 * Safe JSON fetch: extracts JSON from an API response with guard rails.
 *
 * - Throws if response is not ok (non-2xx)
 * - Throws if content-type is not application/json (e.g. HTML error page)
 * - Throws if JSON parsing fails
 *
 * Use this for every API call that expects JSON.
 */
export async function apiFetchJson(path: string, options?: RequestInit): Promise<any> {
  const res = await apiFetch(path, options);

  const contentType = res.headers.get("content-type") || "";

  if (!res.ok) {
    let body = "";
    try {
      body = await res.text();
    } catch {}
    throw new Error(`API ${res.status} ${res.statusText} — ${path}: ${body.slice(0, 200)}`);
  }

  if (!contentType.includes("application/json")) {
    const body = await res.text().catch(() => "");
    const preview = body.replace(/\\s+/g, " ").trim().slice(0, 120);
    throw new Error(`Expected JSON from ${path}, got ${contentType || "unknown"}: ${preview}`);
  }

  try {
    return await res.json();
  } catch (err: any) {
    const text = await res.text().catch(() => "");
    throw new Error(`JSON parse error on ${path}: ${err.message} — body: ${text.slice(0, 200)}`);
  }
}

/**
 * Patch window.fetch so that any request to /api/* or /auth/* is
 * automatically redirected to production when running from file:// protocol.
 * Call from a useEffect in a client component.
 */
export function setupCapacitorFetch() {
  if (typeof window === "undefined") return;
  if (window.location.protocol !== "file:") return;
  if ((window as any).__opensend_fetch_patched) return;
  (window as any).__opensend_fetch_patched = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = function patchedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("/api/") || url.startsWith("/auth/")) {
      return originalFetch(`${CAPACITOR_API_BASE}${url}`, init);
    }
    return originalFetch(input, init);
  };
}
