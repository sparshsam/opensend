import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/claim/[code]
 * Returns transfer metadata (no file download).
 * Used by the download page to show file info before downloading.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await params;
    const admin = createAdminClient();

    const { data: transfer, error } = await admin
      .from("opensend_transfers")
      .select("id, file_name, file_size, mime_type, claim_code, download_count, download_limit, expires_at, status, created_at, deleted_at")
      .eq("claim_code", code.toUpperCase())
      .single();

    if (error || !transfer) {
      return NextResponse.json(
        { error: "Transfer not found." },
        { status: 404 },
      );
    }

    // Status checks
    if (transfer.status === "blocked") {
      return NextResponse.json(
        { error: "This transfer has been blocked.", status: "blocked" },
        { status: 403 },
      );
    }

    if (transfer.status === "deleted" || transfer.deleted_at) {
      return NextResponse.json(
        { error: "This transfer has been deleted by the sender.", status: "deleted" },
        { status: 410 },
      );
    }

    const now = new Date();
    const expiresAt = new Date(transfer.expires_at);

    if (transfer.status !== "expired" && expiresAt < now) {
      // Auto-expire
      await admin.from("opensend_transfers")
        .update({ status: "expired" })
        .eq("id", transfer.id);
      return NextResponse.json(
        { error: "This transfer has expired.", status: "expired" },
        { status: 410 },
      );
    }

    if (transfer.status !== "available") {
      return NextResponse.json(
        { error: `Transfer is ${transfer.status}.`, status: transfer.status },
        { status: 409 },
      );
    }

    if (
      transfer.download_limit !== null &&
      transfer.download_count >= transfer.download_limit
    ) {
      return NextResponse.json(
        { error: "Download limit reached.", status: "expired" },
        { status: 410 },
      );
    }

    return NextResponse.json({
      id: transfer.id,
      file_name: transfer.file_name,
      file_size: transfer.file_size,
      mime_type: transfer.mime_type,
      claim_code: transfer.claim_code,
      download_count: transfer.download_count,
      download_limit: transfer.download_limit,
      expires_at: transfer.expires_at,
      status: "available",
    });

  } catch (error) {
    console.error("Claim lookup error:", error);
    return NextResponse.json(
      { error: "Failed to look up transfer." },
      { status: 500 },
    );
  }
}
