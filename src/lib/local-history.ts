/**
 * OpenSend v0.2.2 — Local-First Transfer History
 *
 * History is stored in localStorage for guest users.
 * Signed-in users also sync to Supabase, but local is primary.
 */

const HISTORY_KEY = "opensend_history";

export interface LocalHistoryEntry {
  id: string;
  direction: "sent" | "received";
  fileName: string;
  fileSize: number;
  mimeType: string;
  peerDevice: string;
  status: "completed" | "cancelled" | "failed";
  method: "direct" | "relay";
  transferredAt: string;
  checksum?: string;
}

/** Load all local history */
export function getLocalHistory(): LocalHistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Add an entry to local history */
export function addLocalHistory(entry: LocalHistoryEntry) {
  const history = getLocalHistory();
  history.unshift(entry);
  // Keep last 200 entries
  if (history.length > 200) history.pop();
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

/** Delete a single history entry */
export function deleteLocalHistory(id: string) {
  const history = getLocalHistory().filter((e) => e.id !== id);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

/** Clear all local history */
export function clearLocalHistory() {
  localStorage.removeItem(HISTORY_KEY);
}
