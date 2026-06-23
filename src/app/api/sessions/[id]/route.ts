import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// GET /api/sessions/[id] — get session details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: session, error } = await admin
      .from("opensend_transfer_sessions")
      .select("*, sender_device:opensend_devices!sender_device_id(*), receiver_device:opensend_devices!receiver_device_id(*)")
      .eq("id", id)
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .single();

    if (error || !session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    return NextResponse.json(session);
  } catch (error) {
    console.error("Get session error:", error);
    return NextResponse.json({ error: "Failed to get session." }, { status: 500 });
  }
}

// PATCH /api/sessions/[id] — update session status
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const body = await request.json();
    const { status, connection_type } = body;

    const admin = createAdminClient();

    // Verify user is sender or receiver
    const { data: existing, error: checkError } = await admin
      .from("opensend_transfer_sessions")
      .select("id, status")
      .eq("id", id)
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .single();

    if (checkError || !existing) {
      return NextResponse.json({ error: "Session not found or access denied." }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};
    if (status) updates.status = status;
    if (connection_type) updates.connection_type = connection_type;
    if (status === "completed" || status === "failed" || status === "cancelled") {
      updates.completed_at = new Date().toISOString();
    }

    const { data, error } = await admin
      .from("opensend_transfer_sessions")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: "Failed to update session." }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Update session error:", error);
    return NextResponse.json({ error: "Failed to update session." }, { status: 500 });
  }
}
