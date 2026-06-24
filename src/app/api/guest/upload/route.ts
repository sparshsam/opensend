import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateClaimCode } from "@/lib/utils";
import { v4 as uuidv4 } from "uuid";

const MAX_FILE_SIZE = 52428800; // 50 MB

/**
 * POST /api/guest/upload
 * Guest-compatible upload endpoint for Cloud Transfer mode.
 * Authenticates via guest session transfer_secret (no user account required).
 */
export async function POST(request: NextRequest) {
  try {
    const sessionId = request.headers.get("X-Session-Id");
    const transferCode = request.headers.get("X-Transfer-Code");
    const transferSecret = request.headers.get("X-Transfer-Secret");

    if (!sessionId || !transferSecret) {
      return NextResponse.json({ error: "Guest session required." }, { status: 401 });
    }

    const admin = createAdminClient();

    // Verify the guest session
    const { data: session, error: sessError } = await admin
      .from("opensend_guest_sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    if (sessError || !session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    if (session.transfer_secret !== transferSecret) {
      return NextResponse.json({ error: "Invalid session secret." }, { status: 403 });
    }

    // Parse form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    if (file.size === 0) {
      return NextResponse.json({ error: "Empty file." }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File too large. Maximum: 50 MB." }, { status: 413 });
    }

    // Sanitize file name
    const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 255);
    if (!safeFileName) {
      return NextResponse.json({ error: "Invalid file name." }, { status: 400 });
    }

    const claimCode = generateClaimCode();
    const fileId = uuidv4();
    const storagePath = `guest/${sessionId}/${fileId}/${safeFileName}`;

    // Upload to Supabase Storage
    const fileBuffer = await file.arrayBuffer();
    const { error: uploadError } = await admin.storage
      .from("opensend-transfers")
      .upload(storagePath, fileBuffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return NextResponse.json({ error: "Upload failed." }, { status: 500 });
    }

    // Create transfer record (no user_id — guest transfer)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { data: transfer, error: dbError } = await admin
      .from("opensend_transfers")
      .insert({
        file_name: safeFileName,
        file_size: file.size,
        mime_type: file.type || "application/octet-stream",
        storage_path: storagePath,
        claim_code: claimCode,
        download_count: 0,
        download_limit: null,
        status: "available",
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (dbError || !transfer) {
      await admin.storage.from("opensend-transfers").remove([storagePath]);
      console.error("DB insert error:", dbError);
      return NextResponse.json({ error: "Upload failed." }, { status: 500 });
    }

    return NextResponse.json({
      id: transfer.id,
      file_name: safeFileName,
      file_size: file.size,
      claim_code: claimCode,
      share_url: `${request.nextUrl.origin}/t/${claimCode}`,
      expires_at: expiresAt,
      status: "available",
    });
  } catch (error) {
    console.error("Guest upload error:", error);
    return NextResponse.json({ error: "Upload failed." }, { status: 500 });
  }
}
