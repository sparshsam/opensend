/**
 * Cleans up expired guest sessions and their associated cloud storage files.
 * Called periodically via Vercel Cron Jobs.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Record<string, unknown> = {};

  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();

    // 1. Expire sessions older than 15 minutes that are still "waiting" or "paired"
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: expiredSessions, error: expireError } = await admin
      .from("opensend_guest_sessions")
      .update({ status: "expired" })
      .in("status", ["waiting", "paired"])
      .lt("created_at", fifteenMinAgo)
      .select("id");

    results.sessions_expired = expiredSessions?.length ?? 0;
    if (expireError) results.expire_error = expireError.message;

    // 2. Clean up old guest signals (keep last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: deletedSignals, error: signalError } = await admin
      .from("opensend_guest_signals")
      .delete()
      .lt("created_at", oneHourAgo)
      .select("id");

    results.signals_cleaned = deletedSignals?.length ?? 0;
    if (signalError) results.signal_error = signalError.message;

    // 3. Clean up expired cloud transfers from storage
    const { data: expiredTransfers, error: transferError } = await admin
      .from("opensend_transfers")
      .select("id, storage_path")
      .lt("expires_at", new Date().toISOString())
      .neq("status", "deleted");

    if (expiredTransfers && expiredTransfers.length > 0) {
      results.transfers_expired = expiredTransfers.length;

      // Mark as expired
      const transferIds = expiredTransfers.map((t: any) => t.id);
      await admin
        .from("opensend_transfers")
        .update({ status: "expired" })
        .in("id", transferIds);

      // Delete from storage
      const storagePaths = expiredTransfers
        .map((t: any) => t.storage_path)
        .filter(Boolean);
      if (storagePaths.length > 0) {
        const { error: storageError } = await admin.storage
          .from("transfers")
          .remove(storagePaths);
        if (storageError) results.storage_error = storageError.message;
        results.storage_files_removed = storagePaths.length;
      }
    }
    if (transferError) results.transfer_error = transferError.message;

    results.success = true;
  } catch (err: any) {
    results.success = false;
    results.error = err.message;
  }

  return NextResponse.json(results);
}
