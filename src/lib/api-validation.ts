/**
 * Shared API validation utilities for guest routes.
 * Provides string/numeric validation, sanitization, and an in-memory rate limiter.
 */

// ── Constants ────────────────────────────────────────────────────────────────

/** Allowed guest session status values. */
export const ALLOWED_STATUSES = [
  "waiting",
  "paired",
  "transferring",
  "completed",
  "cancelled",
  "expired",
] as const;

export type SessionStatus = (typeof ALLOWED_STATUSES)[number];

/** Allowed signaling message types. */
export const ALLOWED_MESSAGE_TYPES = [
  "offer",
  "answer",
  "ice-candidate",
  "receiver-joined",
  "receiver-joined-ack",
  "sender-ready",
  "file-complete",
  "checksum-ok",
  "checksum-fail",
  "batch-received",
  "cancel",
  "keepalive",
] as const;

export type SignalMessageType = (typeof ALLOWED_MESSAGE_TYPES)[number];

// ── Validators ───────────────────────────────────────────────────────────────

const ALPHANUMERIC_SPACES = /^[a-zA-Z0-9 _-]+$/;
const ALPHANUMERIC_6 = /^[a-zA-Z0-9]{6}$/;
const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Validate a string value.
 * Returns null if valid, or an error message string if invalid.
 */
export function validateString(
  value: unknown,
  min: number,
  max: number,
  pattern?: RegExp,
): string | null {
  if (typeof value !== "string") {
    return `Expected a string, received ${typeof value}`;
  }
  const trimmed = value.trim();
  if (trimmed.length < min) {
    return `Must be at least ${min} character${min === 1 ? "" : "s"} (got ${trimmed.length})`;
  }
  if (trimmed.length > max) {
    return `Must be at most ${max} character${max === 1 ? "" : "s"} (got ${trimmed.length})`;
  }
  if (pattern && !pattern.test(trimmed)) {
    return `Contains invalid characters`;
  }
  return null;
}

/**
 * Validate a numeric value.
 * Returns null if valid, or an error message string if invalid.
 */
export function validateNumeric(
  value: unknown,
  min: number,
  max: number,
): string | null {
  if (typeof value === "string") {
    const parsed = Number(value);
    if (isNaN(parsed)) return "Must be a valid number";
    value = parsed;
  }
  if (typeof value !== "number" || isNaN(value)) {
    return `Expected a number, received ${typeof value}`;
  }
  if (value < min) {
    return `Must be at least ${min} (got ${value})`;
  }
  if (value > max) {
    return `Must be at most ${max} (got ${value})`;
  }
  return null;
}

/**
 * Sanitize a string: strip non-alphanumeric characters (except . _ - space),
 * truncate to maxLength, and trim whitespace.
 */
export function sanitizeString(value: string, maxLength: number): string {
  return value
    .replace(/[^a-zA-Z0-9 ._\-]/g, "")
    .slice(0, maxLength)
    .trim();
}

/**
 * Validate that a value is a valid UUID (v4).
 */
export function validateUUID(value: unknown): string | null {
  if (typeof value !== "string") {
    return `Expected a string for UUID, received ${typeof value}`;
  }
  if (!UUID_PATTERN.test(value)) {
    return "Invalid UUID format";
  }
  return null;
}

/**
 * Validate a 6-character alphanumeric transfer code.
 */
export function validateTransferCode(value: unknown): string | null {
  if (typeof value !== "string") {
    return `Expected a string for transfer code, received ${typeof value}`;
  }
  if (!ALPHANUMERIC_6.test(value)) {
    return "Transfer code must be exactly 6 alphanumeric characters";
  }
  return null;
}

/**
 * Validate that status is one of the allowed values.
 */
export function validateStatus(value: unknown): string | null {
  if (typeof value !== "string") {
    return `Expected a string for status, received ${typeof value}`;
  }
  if (!(ALLOWED_STATUSES as readonly string[]).includes(value)) {
    return `Invalid status "${value}". Allowed: ${ALLOWED_STATUSES.join(", ")}`;
  }
  return null;
}

/**
 * Validate that message_type is one of the allowed values.
 */
export function validateMessageType(value: unknown): string | null {
  if (typeof value !== "string") {
    return `Expected a string for message_type, received ${typeof value}`;
  }
  if (!(ALLOWED_MESSAGE_TYPES as readonly string[]).includes(value)) {
    return `Invalid message_type "${value}". Allowed: ${ALLOWED_MESSAGE_TYPES.join(", ")}`;
  }
  return null;
}

// ── Rate Limiter ─────────────────────────────────────────────────────────────

interface RateLimitEntry {
  count: number;
  resetAt: number; // epoch ms when the window resets
}

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 5; // max sessions per IP per window
const CLEANUP_INTERVAL_MS = 60_000; // clear stale entries every 60s

const ipMap = new Map<string, RateLimitEntry>();
let lastCleanup = Date.now();

/**
 * Check if a request from the given IP is rate-limited.
 *
 * Returns `{ allowed: true }` or `{ allowed: false, retryAfter: number }`
 * where retryAfter is seconds until the rate limit resets.
 */
export function checkRateLimit(
  ip: string,
  maxRequests: number = MAX_REQUESTS,
  windowMs: number = WINDOW_MS,
): { allowed: true } | { allowed: false; retryAfter: number } {
  // Periodic cleanup of stale entries
  const now = Date.now();
  if (now - lastCleanup > CLEANUP_INTERVAL_MS) {
    for (const [key, entry] of ipMap) {
      if (now >= entry.resetAt) {
        ipMap.delete(key);
      }
    }
    lastCleanup = now;
  }

  const entry = ipMap.get(ip);

  // First request or window expired → start a new window
  if (!entry || now >= entry.resetAt) {
    ipMap.set(ip, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  // Within window — check limit
  if (entry.count >= maxRequests) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, retryAfter };
  }

  entry.count += 1;
  return { allowed: true };
}

/**
 * Extract the client IP from a NextRequest.
 * Respects x-forwarded-for, x-real-ip, then falls back to a loopback default.
 */
export function extractClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // Take the first IP in the chain
    return forwarded.split(",")[0]!.trim();
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "127.0.0.1";
}
