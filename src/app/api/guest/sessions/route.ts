import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generatePairCode } from "@/lib/ephemeral-names";
import {
  validateString,
  validateNumeric,
  sanitizeString,
  validateUUID,
  validateTransferCode,
  validateStatus,
  checkRateLimit,
  extractClientIp,
  ALLOWED_STATUSES,
} from "@/lib/api-validation";

const MAX_FILES = 20;
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const MAX_TOTAL_SIZE = 500 * 1024 * 1024; // 500 MB

// POST /api/guest/sessions — create a guest transfer session
export async function POST(request: NextRequest) {
  try {
    // ── Rate limiting ──
    const clientIp = extractClientIp(request);
    const rateCheck = checkRateLimit(clientIp);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: `Too many requests. Try again in ${rateCheck.retryAfter} seconds.` },
        { status: 429, headers: { "Retry-After": String(rateCheck.retryAfter) } },
      );
    }

    const body = await request.json();
    const { sender_name, file_name, file_size, mime_type, file_count, total_size } = body;

    // ── Sender name validation ──
    const nameErr = validateString(sender_name, 3, 50, /^[a-zA-Z0-9 _-]+$/);
    if (nameErr) {
      return NextResponse.json({ error: `Invalid sender_name: ${nameErr}` }, { status: 400 });
    }

    // ── File name validation ──
    const fileNameErr = validateString(file_name, 1, 255);
    if (fileNameErr) {
      return NextResponse.json({ error: `Invalid file_name: ${fileNameErr}` }, { status: 400 });
    }

    // ── Validation ──
    const count = file_count || 1;
    const size = file_size || 0;
    const total = total_size || size;

    // Validate file_size and total_size as numbers within limits
    if (file_size !== undefined) {
      const sizeErr = validateNumeric(file_size, 0, MAX_FILE_SIZE);
      if (sizeErr) {
        return NextResponse.json({ error: `Invalid file_size: ${sizeErr}` }, { status: 400 });
      }
    }

    if (total_size !== undefined) {
      const totalErr = validateNumeric(total_size, 0, MAX_TOTAL_SIZE);
      if (totalErr) {
        return NextResponse.json({ error: `Invalid total_size: ${totalErr}` }, { status: 400 });
      }
    }

    if (file_count !== undefined) {
      const countErr = validateNumeric(file_count, 1, MAX_FILES);
      if (countErr) {
        return NextResponse.json({ error: `Invalid file_count: ${countErr}` }, { status: 400 });
      }
    }

    if (count > MAX_FILES) {
      return NextResponse.json({ error: `Too many files. Maximum: ${MAX_FILES} files per session.` }, { status: 400 });
    }

    if (size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: `File too large. Maximum: 50 MB per file.` }, { status: 400 });
    }

    if (total > MAX_TOTAL_SIZE) {
      return NextResponse.json({ error: `Total transfer size exceeds 500 MB limit.` }, { status: 400 });
    }

    // ── Sanitize string inputs ──
    const sanitizedName = sanitizeString(sender_name, 50);
    const sanitizedFileName = sanitizeString(file_name, 255);
    const sanitizedMime = typeof mime_type === "string" ? mime_type.replace(/[^a-zA-Z0-9/+\-_.]/g, "").slice(0, 128) : "application/octet-stream";

    const admin = createAdminClient();
    const transferCode = generatePairCode();
    const transferSecret = crypto.randomUUID();
    const isBatch = count > 1;

    const insertPayload: Record<string, unknown> = {
      transfer_code: transferCode,
      transfer_secret: transferSecret,
      sender_ephemeral_id: sanitizedName,
      file_name: sanitizedFileName,
      file_size: size,
      mime_type: sanitizedMime,
      file_count: count,
      total_size: total,
      transfer_type: isBatch ? "batch" : "single",
      status: "waiting",
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    };

    console.log("[GuestSession] Creating session:", JSON.stringify(insertPayload, null, 2));

    const { data: session, error } = await admin
      .from("opensend_guest_sessions")
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      console.error("[GuestSession] Database insert error:", JSON.stringify(error));
      return NextResponse.json({
        error: `Database error: ${error.message || "Unknown database error"}`,
        details: error.details || null,
        hint: error.hint || null,
        code: error.code || null,
      }, { status: 500 });
    }

    console.log("[GuestSession] Created session:", session.id);

    return NextResponse.json({
      session_id: session.id,
      transfer_code: transferCode,
      transfer_secret: transferSecret,
      sender_name,
      expires_at: session.expires_at,
    });
  } catch (error) {
    console.error("[GuestSession] Create error:", error);
    const message = error instanceof Error ? error.message : "Failed to create session.";
    return NextResponse.json({
      error: `Server error: ${message}`,
    }, { status: 500 });
  }
}

// GET /api/guest/sessions — look up a guest session by transfer code or ID
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const sessionId = searchParams.get("session_id");
    const secret = searchParams.get("secret");

    if (!code && !sessionId) {
      return NextResponse.json({ error: "Transfer code or session ID required." }, { status: 400 });
    }

    // ── Validate session_id if provided ──
    if (sessionId) {
      const uuidErr = validateUUID(sessionId);
      if (uuidErr) {
        return NextResponse.json({ error: `Invalid session_id: ${uuidErr}` }, { status: 400 });
      }
    }

    // ── Validate transfer code if provided ──
    if (code) {
      const codeErr = validateTransferCode(code);
      if (codeErr) {
        return NextResponse.json({ error: `Invalid transfer code: ${codeErr}` }, { status: 400 });
      }
    }

    const admin = createAdminClient();
    let query;

    if (sessionId) {
      query = admin.from("opensend_guest_sessions").select("*").eq("id", sessionId);
    } else {
      query = admin.from("opensend_guest_sessions").select("*").eq("transfer_code", code!.toUpperCase());
    }

    const { data: session, error } = await query.single();

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
    const { session_id, secret, transfer_code, status, receiver_name, file_name, file_size, mime_type, connection_type } = body;

    if (!session_id || (!secret && !transfer_code)) {
      return NextResponse.json({ error: "Session ID and secret or transfer_code required." }, { status: 400 });
    }

    // ── Validate session_id ──
    const uuidErr = validateUUID(session_id);
    if (uuidErr) {
      return NextResponse.json({ error: `Invalid session_id: ${uuidErr}` }, { status: 400 });
    }

    // ── Validate transfer_code if provided ──
    if (transfer_code) {
      const codeErr = validateTransferCode(transfer_code);
      if (codeErr) {
        return NextResponse.json({ error: `Invalid transfer_code: ${codeErr}` }, { status: 400 });
      }
    }

    const admin = createAdminClient();

    // Verify the session exists
    const { data: session, error: lookupError } = await admin
      .from("opensend_guest_sessions")
      .select("*")
      .eq("id", session_id)
      .single();

    if (lookupError || !session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};

    if (secret === session.transfer_secret) {
      // Full access with transfer_secret — allow all fields
      if (status) {
        const statusErr = validateStatus(status);
        if (statusErr) {
          return NextResponse.json({ error: `Invalid status: ${statusErr}` }, { status: 400 });
        }
        updates.status = status;
      }
      if (receiver_name) updates.receiver_ephemeral_id = receiver_name;
      if (file_name) updates.file_name = file_name;
      if (file_size !== undefined) updates.file_size = file_size;
      if (mime_type) updates.mime_type = mime_type;
      if (connection_type) updates.connection_type = connection_type;
    } else if (transfer_code && transfer_code === session.transfer_code) {
      // Receiver join — only allow pairing (no sender-level changes)
      if (status) {
        const statusErr = validateStatus(status);
        if (statusErr) {
          return NextResponse.json({ error: `Invalid status: ${statusErr}` }, { status: 400 });
        }
        if (status !== "paired") {
          return NextResponse.json({ error: "Cannot change status beyond pairing without session secret." }, { status: 403 });
        }
      }
      if (file_name || file_size !== undefined || mime_type || connection_type) {
        return NextResponse.json({ error: "Cannot modify transfer metadata without session secret." }, { status: 403 });
      }
      if (receiver_name) updates.receiver_ephemeral_id = receiver_name;
      if (status) updates.status = status;
    } else {
      return NextResponse.json({ error: "Invalid session secret or transfer_code." }, { status: 403 });
    }

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
