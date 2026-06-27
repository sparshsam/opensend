import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // ── Auth check ────────────────────────────────────────────────
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }

    const admin = createAdminClient();

    // ── Ownership check ───────────────────────────────────────────
    const { data: transfer, error: lookupError } = await admin
      .from("opensend_transfers")
      .select("id, storage_path, status, user_id")
      .eq("id", id)
      .single();

    if (lookupError || !transfer) {
      return NextResponse.json(
        { error: "Transfer not found." },
        { status: 404 },
      );
    }

    if (transfer.user_id !== user.id) {
      return NextResponse.json(
        { error: "Access denied. You can only delete your own transfers." },
        { status: 403 },
      );
    }

    // ── Soft delete ───────────────────────────────────────────────
    const { error: updateError } = await admin
      .from("opensend_transfers")
      .update({
        status: "deleted",
        deleted_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      console.error("Soft delete error:", updateError);
      return NextResponse.json(
        { error: "Failed to delete transfer." },
        { status: 500 },
      );
    }

    // ── Delete storage file ───────────────────────────────────────
    await admin.storage
      .from("opensend-transfers")
      .remove([transfer.storage_path]);

    // ── Log event ─────────────────────────────────────────────────
    await admin.from("opensend_transfer_events").insert({
      transfer_id: id,
      user_id: user.id,
      event_type: "deleted",
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete transfer." },
      { status: 500 },
    );
  }
}
