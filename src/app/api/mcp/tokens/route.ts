import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data, error } = await (admin
      .from("opensend_mcp_tokens") as any)
      .select("id, name, token_prefix, last_used_at, created_at, revoked_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: "Failed to list tokens." }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch (error) {
    console.error("List MCP tokens error:", error);
    return NextResponse.json({ error: "Failed to list tokens." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const body = await request.json();
    const name = body.name || "MCP Access Token";

    // Generate token: opensend_<32-hex-chars>
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
    const rawToken = `opensend_${hex}`;

    // SHA-256 hash it
    const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawToken));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const tokenHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    const tokenPrefix = rawToken.slice(0, 12) + "...";

    const admin = createAdminClient();
    const { data, error } = await (admin
      .from("opensend_mcp_tokens") as any)
      .insert({
        user_id: user.id,
        name,
        token_hash: tokenHash,
        token_prefix: tokenPrefix,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: "Failed to create token." }, { status: 500 });
    }

    return NextResponse.json({
      id: (data as any).id,
      name,
      token: rawToken,
      token_prefix: tokenPrefix,
      message: "Save this token now. It will not be shown again.",
    });
  } catch (error) {
    console.error("Create MCP token error:", error);
    return NextResponse.json({ error: "Failed to create token." }, { status: 500 });
  }
}
