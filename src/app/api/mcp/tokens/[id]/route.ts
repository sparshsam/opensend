import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const { id } = await params;
    const admin = createAdminClient();

    // Ownership check
    const { data: existing, error: checkError } = await (admin
      .from("opensend_mcp_tokens") as any)
      .select("id")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (checkError || !existing) {
      return NextResponse.json({ error: "Token not found or access denied." }, { status: 404 });
    }

    const { error } = await (admin
      .from("opensend_mcp_tokens") as any)
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: "Failed to revoke token." }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Token revoked successfully." });
  } catch (error) {
    console.error("Revoke MCP token error:", error);
    return NextResponse.json({ error: "Failed to revoke token." }, { status: 500 });
  }
}
