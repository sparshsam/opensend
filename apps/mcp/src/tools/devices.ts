import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Client } from "../supabase.js";

export function registerDeviceTools(
  server: McpServer,
  getClient: () => Client,
  userId: string,
) {
  // ── LIST DEVICES ────────────────────────────────────────────────
  server.tool(
    "list_my_devices",
    "List all your registered devices. Returns device name, platform (windows/android/ios/macos/linux/web), OS, browser, device type, and last seen timestamp. Use this to see what devices are linked to your account.",
    {},
    async () => {
      const { data, error } = await getClient()
        .from("opensend_devices")
        .select("*")
        .eq("user_id", userId)
        .order("last_seen_at", { ascending: false });

      if (error) throw new Error("Failed to list devices: " + error.message);

      return {
        content: [{ type: "text" as const, text: JSON.stringify(data ?? [], null, 2) }],
      };
    },
  );

  // ── GET DEVICE ──────────────────────────────────────────────────
  server.tool(
    "get_device",
    "Get details for one of your registered devices by its ID. Returns name, platform, OS, browser, device type, fingerprint, and timestamps.",
    {
      deviceId: z.string().describe("The ID of the device to retrieve."),
    },
    async ({ deviceId }) => {
      const { data, error } = await getClient()
        .from("opensend_devices")
        .select("*")
        .eq("id", deviceId)
        .eq("user_id", userId)
        .single();

      if (error) throw new Error("Failed to get device: " + error.message);

      return {
        content: [
          {
            type: "text" as const,
            text: data
              ? JSON.stringify(data, null, 2)
              : "Device not found. The ID may be invalid or the device does not belong to your account.",
          },
        ],
      };
    },
  );

  // ── RENAME DEVICE ────────────────────────────────────────────────
  server.tool(
    "rename_device",
    "Rename one of your registered devices. Use this to give your devices friendly names like 'Sparsh-PC' or 'Sparsh-iPhone'.",
    {
      deviceId: z.string().describe("The ID of the device to rename."),
      name: z.string().min(1).max(100).describe("The new name for the device."),
    },
    async ({ deviceId, name }) => {
      // Ownership check
      const { data: existing, error: checkError } = await getClient()
        .from("opensend_devices")
        .select("id")
        .eq("id", deviceId)
        .eq("user_id", userId)
        .single();

      if (checkError || !existing) {
        throw new Error("Device not found or access denied.");
      }

      const c = getClient() as any;
      const { data, error } = await c
        .from("opensend_devices")
        .update({ name })
        .eq("id", deviceId)
        .select()
        .single();

      if (error) throw new Error("Failed to rename device: " + error.message);

      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  // ── LIST TRANSFER HISTORY ────────────────────────────────────────
  server.tool(
    "list_transfer_history",
    "List your complete transfer history including both sent and received transfers. Returns file name, size, status, peer device name, and timestamps. Use this for a comprehensive view of all your transfers.",
    {
      direction: z.enum(["sent", "received", "all"]).optional().default("all").describe("Filter by transfer direction. 'sent' = files you sent, 'received' = files you received, 'all' = both."),
      limit: z.number().optional().default(20).describe("Maximum results to return."),
    },
    async ({ direction, limit }) => {
      const results: Record<string, unknown>[] = [];

      if (direction === "all" || direction === "sent") {
        const { data, error } = await getClient()
          .from("opensend_transfers")
          .select("*, opensend_devices!sender_device_id(name)")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(limit ?? 20);

        if (error) throw new Error("Failed to list sent transfers: " + error.message);

        const rows = (data ?? []) as any[];
        for (const row of rows) {
          results.push({
            direction: "sent",
            id: row.id,
            file_name: row.file_name,
            file_size: row.file_size,
            mime_type: row.mime_type,
            status: row.status,
            peer_device: row.opensend_devices?.name ?? "Unknown Device",
            created_at: row.created_at,
          });
        }
      }

      if (direction === "all" || direction === "received") {
        const { data, error } = await getClient()
          .from("opensend_transfers")
          .select("*, opensend_devices!receiver_device_id(name)")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(limit ?? 20);

        if (error) throw new Error("Failed to list received transfers: " + error.message);

        const rows2 = (data ?? []) as any[];
        for (const row of rows2) {
          results.push({
            direction: "received",
            id: row.id,
            file_name: row.file_name,
            file_size: row.file_size,
            mime_type: row.mime_type,
            status: row.status,
            peer_device: row.opensend_devices?.name ?? "Unknown Device",
            created_at: row.created_at,
          });
        }
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
      };
    },
  );
}
