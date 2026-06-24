import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generatePairCode } from "@/lib/ephemeral-names";

// POST /api/guest/sessions — create a guest transfer session
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sender_name, file_name, file_size, mime_type } = body;

    if (!sender_name || !file_name) {
      return NextResponse.json({ error: "Sender name and file name required." }, { status: 400 });
    }

    const admin = createAdminClient();
    const transferCode = generatePairCode();
    const transferSecret = crypto.randomUUID();

    const { data: session, error } = await admin
      .from("opensend_guest_sessions")
      .insert({
        transfer_code: transferCode,
        transfer_secret: transferSecret,
        sender_ephemeral_id: sender_name,
        file_name,
        file_size: file_size || 0,
        mime_type: mime_type || "application/octet-stream",
        status: "waiting",
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("Guest session error:", error);
      return NextResponse.json({ error: "Failed to create session." }, { status: 500 });
    }

    return NextResponse.json({
      session_id: session.id,
      transfer_code: transferCode,
      transfer_secret: transferSecret,
      sender_name,
      expires_at: session.expires_at,
    });
  } catch (error) {
    console.error("Create guest session error:", error);
    return NextResponse.json({ error: "Failed to create session." }, { status: 500 });
  }
}

// GET /api/guest/sessions — look up a guest session by transfer code
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const secret = searchParams.get("secret");

    if (!code) {
      return NextResponse.json({ error: "Transfer code required." }, { status: 400 });
    }

    const admin = createAdminClient();
    const codeUpper = code.toUpperCase();

    const { data: session, error } = await admin
      .from("opensend_guest_sessions")
      .select("*")
      .eq("transfer_code", codeUpper)
      .single();

    if (error || !session) {
      return NextResponse.json({ error: "Session not found. Check the code." }, { status: 404 });
    }

    // Check expiry
    if (new Date(session.expires_at) < new Date()) {
      // Auto-expire
      await admin.from("opensend_guest_sessions")
        .update({ status: "expired" })
        .eq("id", session.id);
      return NextResponse.json({ error: "This session has expired." }, { status: 410 });
    }

    if (session.status === "cancelled") {
      return NextResponse.json({ error: "This session was cancelled." }, { status: 410 });
    }

    if (session.status === "completed") {
      return NextResponse.json({ error: "This session is already complete." }, { status: 410 });
    }

    // If secret is provided, validate it (full access)
    const isCreator = secret === session.transfer_secret;

    return NextResponse.json({
      session_id: session.id,
      transfer_code: session.transfer_code,
      sender_name: session.sender_ephemeral_id,
      receiver_name: session.receiver_ephemeral_id,
      file_name: session.file_name,
      file_size: session.file_size,
      mime_type: session.mime_type,
      status: session.status,
      expires_at: session.expires_at,
      is_creator: isCreator,
    });
  } catch (error) {
    console.error("Lookup guest session error:", error);
    return NextResponse.json({ error: "Failed to look up session." }, { status: 500 });
  }
}

// PATCH /api/guest/sessions — update a guest session
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { session_id, secret, status, receiver_name, file_name, file_size, mime_type, connection_type } = body;

    if (!session_id || !secret) {
      return NextResponse.json({ error: "Session ID and secret required." }, { status: 400 });
    }

    const admin = createAdminClient();

    // Verify the secret
    const { data: session, error: lookupError } = await admin
      .from("opensend_guest_sessions")
      .select("*")
      .eq("id", session_id)
      .single();

    if (lookupError || !session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    if (session.transfer_secret !== secret) {
      return NextResponse.json({ error: "Invalid session secret." }, { status: 403 });
    }

    const updates: Record<string, unknown> = {};
    if (status) updates.status = status;
    if (receiver_name) updates.receiver_ephemeral_id = receiver_name;
    if (file_name) updates.file_name = file_name;
    if (file_size !== undefined) updates.file_size = file_size;
    if (mime_type) updates.mime_type = mime_type;
    if (connection_type) updates.connection_type = connection_type;

    const { data: updated, error } = await admin
      .from("opensend_guest_sessions")
      .update(updates)
      .eq("id", session_id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: "Failed to update session." }, { status: 500 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Update guest session error:", error);
    return NextResponse.json({ error: "Failed to update session." }, { status: 500 });
  }
}
