import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { generateClaimCode } from "@/lib/utils";
import { v4 as uuidv4 } from "uuid";
import { cookies } from "next/headers";

const MAX_FILE_SIZE = 52428800; // 50 MB

export async function POST(request: NextRequest) {
  try {
    // ── Auth check ────────────────────────────────────────────────
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required. Sign in to upload files." },
        { status: 401 },
      );
    }

    // ── Parse form data ───────────────────────────────────────────
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided. Select a file to upload." },
        { status: 400 },
      );
    }

    // ── File validation ───────────────────────────────────────────
    if (file.size === 0) {
      return NextResponse.json(
        { error: "Empty file. Select a file with content." },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum: 50 MB.` },
        { status: 413 },
      );
    }

    // ── Validate file name (no path traversal) ────────────────────
    const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 255);
    if (!safeFileName) {
      return NextResponse.json(
        { error: "Invalid file name." },
        { status: 400 },
      );
    }

    // ── Generate identifiers ──────────────────────────────────────
    const claimCode = generateClaimCode();
    const shareToken = uuidv4();
    const fileId = uuidv4();
    const storagePath = `${user.id}/${fileId}/${safeFileName}`;

    // ── Hash the share token for storage ──────────────────────────
    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(shareToken),
    );
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const shareTokenHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    // ── Upload to Supabase Storage ────────────────────────────────
    const admin = createAdminClient();
    const fileBuffer = await file.arrayBuffer();

    const { error: uploadError } = await admin.storage
      .from("opensend-transfers")
      .upload(storagePath, fileBuffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return NextResponse.json(
        { error: "Upload failed. Please try again." },
        { status: 500 },
      );
    }

    // ── Create transfer record ────────────────────────────────────
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { data: transfer, error: dbError } = await admin
      .from("opensend_transfers")
      .insert({
        user_id: user.id,
        file_name: safeFileName,
        file_size: file.size,
        mime_type: file.type || "application/octet-stream",
        storage_path: storagePath,
        claim_code: claimCode,
        share_token_hash: shareTokenHash,
        password_hash: null,
        virus_scan_status: "pending",
        download_count: 0,
        download_limit: null,
        status: "uploading",
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (dbError || !transfer) {
      // Rollback: remove the uploaded file
      await admin.storage.from("opensend-transfers").remove([storagePath]);
      console.error("DB insert error:", dbError);
      return NextResponse.json(
        { error: "Upload failed. Please try again." },
        { status: 500 },
      );
    }

    // ── Transition to scanning (stub) → available ─────────────────
    // In v0.1.2, virus scanning is stubbed. The status immediately
    // becomes available. Future: async scan via Edge Function.
    const { error: statusError } = await admin
      .from("opensend_transfers")
      .update({ status: "available" })
      .eq("id", transfer.id);

    if (statusError) {
      console.error("Status update error:", statusError);
    }

    // ── Log event ─────────────────────────────────────────────────
    await admin.from("opensend_transfer_events").insert({
      transfer_id: transfer.id,
      user_id: user.id,
      event_type: "upload_completed",
      metadata: { file_name: safeFileName, file_size: file.size, mime_type: file.type },
    });

    // ── Response ──────────────────────────────────────────────────
    const shareUrl = `${request.nextUrl.origin}/t/${claimCode}`;

    return NextResponse.json({
      id: transfer.id,
      file_name: safeFileName,
      file_size: file.size,
      mime_type: file.type,
      share_url: shareUrl,
      claim_code: claimCode,
      expires_at: expiresAt,
      status: "available",
    });

  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Upload failed unexpectedly. Please try again." },
      { status: 500 },
    );
  }
}
