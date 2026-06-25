import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const body = await request.json();
    const { transfer_id, favorite } = body;

    if (!transfer_id) {
      return NextResponse.json({ error: "Transfer ID is required." }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: existing } = await admin
      .from("opensend_transfers")
      .select("id")
      .eq("id", transfer_id)
      .eq("user_id", user.id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Transfer not found." }, { status: 404 });
    }

    const { error } = await admin
      .from("opensend_transfers")
      .update({ is_favorite: favorite === true })
      .eq("id", transfer_id);

    if (error) {
      return NextResponse.json({ error: "Failed to update favorite." }, { status: 500 });
    }

    return NextResponse.json({ success: true, is_favorite: favorite === true });
  } catch (error) {
    console.error("Favorite update error:", error);
    return NextResponse.json({ error: "Failed to update favorite." }, { status: 500 });
  }
}
