import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await params;
    const admin = createAdminClient();

    // ── Look up by claim code ─────────────────────────────────────
    const { data: transfer, error } = await admin
      .from("opensend_transfers")
      .select("*")
      .eq("claim_code", code.toUpperCase())
      .single();

    if (error || !transfer) {
      return NextResponse.json(
        { error: "Transfer not found. Check the code and try again." },
        { status: 404 },
      );
    }

    // ── Status checks ─────────────────────────────────────────────
    if (transfer.status === "blocked") {
      return NextResponse.json(
        { error: "This transfer has been blocked." },
        { status: 403 },
      );
    }

    if (transfer.status === "deleted" || transfer.deleted_at) {
      return NextResponse.json(
        { error: "This transfer has been deleted by the sender." },
        { status: 410 },
      );
    }

    if (transfer.status === "expired" || new Date(transfer.expires_at) < new Date()) {
      // Mark as expired if not already
      if (transfer.status !== "expired") {
        await admin.from("opensend_transfers")
          .update({ status: "expired" })
          .eq("id", transfer.id);
      }
      return NextResponse.json(
        { error: "This transfer has expired. Files are automatically deleted after 24 hours." },
        { status: 410 },
      );
    }

    if (transfer.status !== "available") {
      return NextResponse.json(
        { error: `Transfer is still ${transfer.status}. Please wait.` },
        { status: 409 },
      );
    }

    // ── Download limit check ──────────────────────────────────────
    if (transfer.download_limit !== null && transfer.download_count >= transfer.download_limit) {
      return NextResponse.json(
        { error: "Download limit reached." },
        { status: 410 },
      );
    }

    // ── Serve the file from Supabase Storage ──────────────────────
    const { data: fileData, error: downloadError } = await admin.storage
      .from("opensend-transfers")
      .download(transfer.storage_path);

    if (downloadError || !fileData) {
      console.error("Storage download error:", downloadError);
      return NextResponse.json(
        { error: "File not found on storage. It may have been removed." },
        { status: 404 },
      );
    }

    // ── Increment download count ──────────────────────────────────
    await admin.rpc("opensend_increment_download", { target_id: transfer.id });

    // ── Log event ─────────────────────────────────────────────────
    await admin.from("opensend_transfer_events").insert({
      transfer_id: transfer.id,
      event_type: "download_completed",
      metadata: { download_count_before: transfer.download_count },
    });

    // ── Return the file ───────────────────────────────────────────
    const fileName = encodeURIComponent(transfer.file_name);
    return new NextResponse(fileData, {
      status: 200,
      headers: {
        "Content-Type": transfer.mime_type || "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${fileName}`,
        "Content-Length": String(fileData.size),
        "Cache-Control": "no-store",
      },
    });

  } catch (error) {
    console.error("Download error:", error);
    return NextResponse.json(
      { error: "Download failed. Please try again." },
      { status: 500 },
    );
  }
}
