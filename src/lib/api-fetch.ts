/**
 * Platform-agnostic fetch wrapper.
 * In Capacitor/static builds, API calls use the production URL.
 * In web/server mode, they use relative paths.
 */

function getApiBase(): string {
  // Capacitor build: API calls go to production
  if (typeof window !== "undefined" && window.location.protocol === "file:") {
    return "https://send.kovina.org";
  }
  return "";
}

export async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  const base = getApiBase();
  const url = base ? `${base}${path}` : path;
  return fetch(url, options);
}
