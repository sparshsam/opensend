import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// GET /api/sessions — list transfer sessions
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const admin = createAdminClient();
    let query = admin
      .from("opensend_transfer_sessions")
      .select("*, sender_device:opensend_devices!sender_device_id(name, platform, device_type), receiver_device:opensend_devices!receiver_device_id(name, platform, device_type)")
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: "Failed to list sessions." }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch (error) {
    console.error("List sessions error:", error);
    return NextResponse.json({ error: "Failed to list sessions." }, { status: 500 });
  }
}

// POST /api/sessions — create a new transfer session
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const body = await request.json();
    const { receiver_id, receiver_device_id, file_name, file_size, mime_type, checksum } = body;

    if (!receiver_id || !receiver_device_id) {
      return NextResponse.json({ error: "Receiver ID and device ID are required." }, { status: 400 });
    }

    const admin = createAdminClient();

    // Get sender's current device
    const { data: senderDevice } = await admin
      .from("opensend_devices")
      .select("id")
      .eq("user_id", user.id)
      .eq("is_current", true)
      .single();

    if (!senderDevice) {
      return NextResponse.json({ error: "No current device found. Register a device first." }, { status: 400 });
    }

    // Create session
    const { data: session, error: sessionError } = await admin
      .from("opensend_transfer_sessions")
      .insert({
        sender_id: user.id,
        receiver_id,
        sender_device_id: senderDevice.id,
        receiver_device_id,
        status: "waiting",
        connection_type: "unknown",
      })
      .select()
      .single();

    if (sessionError) {
      return NextResponse.json({ error: "Failed to create session." }, { status: 500 });
    }

    // Create transfer record linked to session
    const { data: transfer, error: transferError } = await admin
      .from("opensend_transfers")
      .insert({
        user_id: user.id,
        file_name: file_name || "unknown",
        file_size: file_size || 0,
        mime_type: mime_type || "application/octet-stream",
        storage_path: null,
        claim_code: null,
        share_token_hash: "",
        status: "pending",
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        session_id: session.id,
        checksum: checksum || null,
        sender_device_id: senderDevice.id,
        receiver_device_id,
      })
      .select()
      .single();

    if (transferError) {
      // Rollback session
      await admin.from("opensend_transfer_sessions").delete().eq("id", session.id);
      return NextResponse.json({ error: "Failed to create transfer record." }, { status: 500 });
    }

    return NextResponse.json({ session, transfer });
  } catch (error) {
    console.error("Create session error:", error);
    return NextResponse.json({ error: "Failed to create session." }, { status: 500 });
  }
}
