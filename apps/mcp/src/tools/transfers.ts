import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Client } from "../supabase.js";

const TRANSFER_STATUSES = ["available", "uploading", "scanning", "expired", "blocked", "deleted"] as const;
const SORT_OPTIONS = ["created_at", "file_name", "download_count", "file_size"] as const;

export function registerTransferTools(
  server: McpServer,
  getClient: () => Client,
  userId: string,
) {
  // ── LIST ──────────────────────────────────────────────────────────
  server.tool(
    "list_my_transfers",
    "List all your recent file transfers. Returns file name, size, status (active/expired/deleted), download count, and expiry. Use this to get an overview of your shared files and their current state.",
    {
      status: z.enum(TRANSFER_STATUSES).optional().describe("Filter by transfer status. Omit for all transfers."),
      limit: z.number().optional().default(20).describe("Maximum number of transfers to return (default 20)."),
      offset: z.number().optional().default(0).describe("Number of transfers to skip for pagination."),
      sortBy: z.enum(SORT_OPTIONS).optional().default("created_at").describe("Field to sort by."),
    },
    async ({ status, limit, offset, sortBy }) => {
      let query = getClient()
        .from("opensend_transfers")
        .select("*")
        .eq("user_id", userId);

      if (status === "available") {
        query = query.eq("status", "available").gt("expires_at", new Date().toISOString()).is("deleted_at", null);
      } else if (status === "expired") {
        query = query.eq("status", "expired");
      } else if (status === "deleted") {
        query = query.not("deleted_at", "is", null);
      } else if (status === "blocked") {
        query = query.eq("status", "blocked");
      } else if (status === "uploading" || status === "scanning") {
        query = query.eq("status", status);
      } else {
        query = query.is("deleted_at", null);
      }

      const { data, error } = await query
        .order(sortBy ?? "created_at", { ascending: false })
        .range(offset ?? 0, (offset ?? 0) + (limit ?? 20) - 1);

      if (error) throw new Error("Failed to list transfers: " + error.message);

      return {
        content: [{ type: "text" as const, text: JSON.stringify(data ?? [], null, 2) }],
      };
    },
  );

  // ── GET ───────────────────────────────────────────────────────────
  server.tool(
    "get_transfer",
    "Get complete details for one of your file transfers by its ID. Returns file name, size, type, share/claim codes, download count, expiry, and timestamps. Use this to inspect a specific transfer's full metadata.",
    {
      transferId: z.string().describe("The ID of the transfer to retrieve."),
    },
    async ({ transferId }) => {
      const { data, error } = await getClient()
        .from("opensend_transfers")
        .select("*")
        .eq("id", transferId)
        .eq("user_id", userId)
        .single();

      if (error) throw new Error("Failed to get transfer: " + error.message);

      return {
        content: [
          {
            type: "text" as const,
            text: data
              ? JSON.stringify(data, null, 2)
              : "Transfer not found. The ID may be invalid or the transfer does not belong to your account.",
          },
        ],
      };
    },
  );

  // ── DELETE (soft-delete with ownership check) ─────────────────────
  server.tool(
    "delete_transfer",
    "Soft-delete one of your file transfers by its ID. The transfer will no longer be downloadable and will not appear in your active list. A deleted transfer can be restored but this tool performs a permanent-style deletion (sets deleted_at timestamp). Use this to remove a transfer you no longer want to share.",
    {
      transferId: z.string().describe("The ID of the transfer to delete."),
    },
    async ({ transferId }) => {
      // Ownership check
      const { data: existing, error: checkError } = await getClient()
        .from("opensend_transfers")
        .select("id")
        .eq("id", transferId)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .single();

      if (checkError || !existing) {
        throw new Error("Transfer not found or access denied. The transfer may already be deleted or belong to another account.");
      }

      const c = getClient() as any;
      const { error } = await c
        .from("opensend_transfers")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", transferId);

      if (error) throw new Error("Failed to delete transfer: " + error.message);

      return {
        content: [{ type: "text" as const, text: `Transfer ${transferId} deleted successfully.` }],
      };
    },
  );

  // ── EXPORT ────────────────────────────────────────────────────────
  server.tool(
    "export_transfer_history",
    "Export all your transfer history as a structured JSON object. Returns active and expired transfers separately with full metadata including file names, sizes, codes, download counts, and timestamps. Use this to back up your transfer records or analyze your usage.",
    {},
    async () => {
      const now = new Date().toISOString();

      const [activeResult, expiredResult, deletedResult] = await Promise.all([
        getClient()
          .from("opensend_transfers")
          .select("*")
          .eq("user_id", userId)
          .gt("expires_at", now)
          .is("deleted_at", null)
          .order("created_at", { ascending: false }),
        getClient()
          .from("opensend_transfers")
          .select("*")
          .eq("user_id", userId)
          .lt("expires_at", now)
          .is("deleted_at", null)
          .order("created_at", { ascending: false }),
        getClient()
          .from("opensend_transfers")
          .select("*")
          .eq("user_id", userId)
          .not("deleted_at", "is", null)
          .order("created_at", { ascending: false }),
      ]);

      if (activeResult.error) throw new Error("Failed to export transfers: " + activeResult.error.message);
      if (expiredResult.error) throw new Error("Failed to export transfers: " + expiredResult.error.message);
      if (deletedResult.error) throw new Error("Failed to export transfers: " + deletedResult.error.message);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                exported_at: now,
                summary: {
                  active: activeResult.data?.length ?? 0,
                  expired: expiredResult.data?.length ?? 0,
                  deleted: deletedResult.data?.length ?? 0,
                  total: (activeResult.data?.length ?? 0) + (expiredResult.data?.length ?? 0) + (deletedResult.data?.length ?? 0),
                },
                active: activeResult.data ?? [],
                expired: expiredResult.data ?? [],
                deleted: deletedResult.data ?? [],
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
