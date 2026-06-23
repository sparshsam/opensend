import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// POST /api/qr — create a pairing QR code session
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const body = await request.json();
    const { target_device_id } = body;

    const admin = createAdminClient();

    // Get our current device
    const { data: myDevice } = await admin
      .from("opensend_devices")
      .select("id, name")
      .eq("user_id", user.id)
      .eq("is_current", true)
      .single();

    if (!myDevice) {
      return NextResponse.json({ error: "No device registered." }, { status: 400 });
    }

    // If target_device_id is provided, create a direct pairing session
    if (target_device_id) {
      const { data: session, error } = await admin
        .from("opensend_transfer_sessions")
        .insert({
          sender_id: user.id,
          sender_device_id: myDevice.id,
          receiver_device_id: target_device_id,
          status: "waiting",
        })
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: "Failed to create pairing session." }, { status: 500 });
      }

      return NextResponse.json({
        type: "pair",
        session_id: session.id,
        qr_data: JSON.stringify({
          type: "opensend-pair",
          session_id: session.id,
          sender_device: myDevice.name,
          sender_device_id: myDevice.id,
        }),
      });
    }

    // Without target, return a pairing code/QR data
    return NextResponse.json({
      type: "pair-request",
      qr_data: JSON.stringify({
        type: "opensend-pair",
        sender_device: myDevice.name,
        sender_device_id: myDevice.id,
        user_id: user.id,
      }),
    });
  } catch (error) {
    console.error("QR pairing error:", error);
    return NextResponse.json({ error: "Failed to create pairing data." }, { status: 500 });
  }
}

// GET /api/qr — resolve QR data (scanned by receiver)
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("session_id");
    const userId = searchParams.get("user_id");

    if (!sessionId && !userId) {
      return NextResponse.json({ error: "Session ID or user ID required." }, { status: 400 });
    }

    const admin = createAdminClient();

    if (sessionId) {
      // Look up existing session
      const { data: session } = await admin
        .from("opensend_transfer_sessions")
        .select("*, sender_device:opensend_devices!sender_device_id(name)")
        .eq("id", sessionId)
        .single();

      if (!session) {
        return NextResponse.json({ error: "Session not found." }, { status: 404 });
      }

      return NextResponse.json({
        session,
        sender_device_name: (session as any).sender_device?.name,
      });
    }

    return NextResponse.json({ error: "Invalid QR data." }, { status: 400 });
  } catch (error) {
    console.error("QR lookup error:", error);
    return NextResponse.json({ error: "Failed to look up QR data." }, { status: 500 });
  }
}
