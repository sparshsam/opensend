import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockDigest = vi.fn();

// Configurable mock for Supabase — returns whatever mockSupabaseResponse is set to
let mockSupabaseResponse: any = null;

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => {
    const db = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            then: vi.fn((resolve: any) => resolve(mockSupabaseResponse || { data: [], error: null })),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            then: vi.fn((resolve: any) => resolve({ error: null })),
          })),
        })),
      })),
    };
    return db;
  }),
}));

beforeEach(() => {
  mockDigest.mockReset();
  mockSupabaseResponse = null;
  vi.stubGlobal("crypto", {
    subtle: { digest: mockDigest },
  });
  // Set default test env vars
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("authenticateToken", () => {
  it("throws when Supabase URL is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    const { authenticateToken } = await import("../supabase.js");
    await expect(authenticateToken("tok_test")).rejects.toThrow(
      "Missing Supabase credentials",
    );
  });

  it("throws when service role key is missing", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const { authenticateToken } = await import("../supabase.js");
    await expect(authenticateToken("tok_test")).rejects.toThrow(
      "Missing SUPABASE_SERVICE_ROLE_KEY",
    );
  });

  it("throws when token is not found", async () => {
    mockDigest.mockResolvedValue(new Uint8Array(32).buffer);
    mockSupabaseResponse = { data: [], error: null };
    const { authenticateToken } = await import("../supabase.js");
    await expect(authenticateToken("tok_invalid")).rejects.toThrow(
      "Authentication failed: Invalid access token",
    );
  });

  it("throws when token is revoked", async () => {
    mockDigest.mockResolvedValue(new Uint8Array(32).buffer);
    mockSupabaseResponse = {
      data: [{ user_id: "user-1", id: "tok-1", revoked_at: "2026-01-01T00:00:00Z" }],
      error: null,
    };
    const { authenticateToken } = await import("../supabase.js");
    await expect(authenticateToken("tok_revoked")).rejects.toThrow(
      "This access token has been revoked",
    );
  });

  it("returns client and userId for a valid token", async () => {
    mockDigest.mockResolvedValue(new Uint8Array(32).buffer);
    mockSupabaseResponse = {
      data: [{ user_id: "user-abc", id: "tok-valid", revoked_at: null }],
      error: null,
    };
    const { authenticateToken } = await import("../supabase.js");
    const result = await authenticateToken("tok_valid");
    expect(result).toHaveProperty("client");
    expect(result).toHaveProperty("userId", "user-abc");
  });
});
