import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const TOKEN_PREFIX = "osd_";

export async function POST(request: NextRequest) {
  try {
    // ── Auth check ────────────────────────────────────────────────
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }

    const { name } = await request.json();
    if (!name || typeof name !== "string" || name.length > 100) {
      return NextResponse.json(
        { error: "Token name is required (max 100 characters)." },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

    // ── Generate token ────────────────────────────────────────────
    const hex = Array.from({ length: 32 }, () =>
      Math.floor(Math.random() * 16).toString(16),
    ).join("");
    const rawToken = `${TOKEN_PREFIX}${hex}`;
    const tokenPrefix = rawToken.slice(0, 10);

    // ── SHA-256 hash ──────────────────────────────────────────────
    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(rawToken),
    );
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const tokenHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    // ── Store hash ────────────────────────────────────────────────
    const { error: insertError } = await admin
      .from("opensend_mcp_tokens")
      .insert({
        user_id: user.id,
        name,
        token_hash: tokenHash,
        token_prefix: tokenPrefix,
      });

    if (insertError) {
      console.error("Token creation error:", insertError);
      return NextResponse.json(
        { error: "Failed to create token." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      token: rawToken,
      prefix: tokenPrefix,
      name,
      message: "Save this token now. It will not be shown again.",
    });

  } catch (error) {
    console.error("Auth token error:", error);
    return NextResponse.json(
      { error: "Failed to create token." },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }

    const admin = createAdminClient();
    const { data: tokens, error } = await admin
      .from("opensend_mcp_tokens")
      .select("id, name, token_prefix, last_used_at, created_at, revoked_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: "Failed to list tokens." },
        { status: 500 },
      );
    }

    return NextResponse.json(tokens ?? []);

  } catch (error) {
    console.error("List tokens error:", error);
    return NextResponse.json(
      { error: "Failed to list tokens." },
      { status: 500 },
    );
  }
}
