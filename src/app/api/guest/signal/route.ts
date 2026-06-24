import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/guest/signal — send a signaling message
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { session_id, secret, sender_type, message_type, payload } = body;

    if (!session_id || !secret || !sender_type || !message_type || !payload) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const admin = createAdminClient();

    // Verify session exists and secret matches
    const { data: session, error: sessError } = await admin
      .from("opensend_guest_sessions")
      .select("id, status")
      .eq("id", session_id)
      .single();

    if (sessError || !session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    if (session.status === "expired" || session.status === "cancelled" || session.status === "completed") {
      return NextResponse.json({ error: "Session is closed." }, { status: 410 });
    }

    // Store signal
    const { error: insertError } = await admin
      .from("opensend_guest_signals")
      .insert({
        session_id,
        sender_type,
        message_type,
        payload,
      });

    if (insertError) {
      return NextResponse.json({ error: "Failed to store signal." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Signal POST error:", error);
    return NextResponse.json({ error: "Failed to send signal." }, { status: 500 });
  }
}

// GET /api/guest/signal — poll for signaling messages
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("session_id");
    const since = searchParams.get("since"); // ISO timestamp, only get messages after this

    if (!sessionId) {
      return NextResponse.json({ error: "Session ID required." }, { status: 400 });
    }

    const admin = createAdminClient();

    let query = admin
      .from("opensend_guest_signals")
      .select("id, sender_type, message_type, payload, created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (since) {
      query = query.gt("created_at", since);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: "Failed to fetch signals." }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch (error) {
    console.error("Signal GET error:", error);
    return NextResponse.json({ error: "Failed to fetch signals." }, { status: 500 });
  }
}
