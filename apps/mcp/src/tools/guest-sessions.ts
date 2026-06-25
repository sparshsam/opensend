import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Client } from "../supabase.js";

export function registerGuestTools(
  server: McpServer,
  getClient: () => Client,
  _userId: string,
) {
  // ── CREATE GUEST SESSION ────────────────────────────────────────────
  server.tool(
    "create_guest_session",
    "Create a new guest transfer session. Returns a 6-character pair code and session ID that the sender shares with the receiver. Use this to start a file transfer without requiring the sender to sign in. The session expires in 15 minutes.",
    {
      senderName: z.string().min(1).max(50).describe("A display name for the sender device, like 'Sparsh-PC' or 'My-Phone'."),
      fileName: z.string().min(1).max(255).describe("The name of the file being sent."),
      fileSize: z.number().positive().max(52428800).describe("File size in bytes (max 50 MB)."),
      mimeType: z.string().optional().default("application/octet-stream").describe("MIME type of the file."),
      fileCount: z.number().optional().default(1).describe("Number of files in this transfer (default 1)."),
      totalSize: z.number().optional().describe("Total size of all files in bytes. Required for batch transfers with multiple files."),
    },
    async ({ senderName, fileName, fileSize, mimeType, fileCount, totalSize }) => {
      const total = totalSize || fileSize;
      const count = fileCount || 1;

      if (count > 20) throw new Error("Maximum 20 files per session.");
      if (total > 524288000) throw new Error("Total transfer size exceeds 500 MB limit.");

      const transferCode = generatePairCode();
      const transferSecret = crypto.randomUUID();

      const { data, error } = await getClient()
        .from("opensend_guest_sessions")
        .insert({
          transfer_code: transferCode,
          transfer_secret: transferSecret,
          sender_ephemeral_id: senderName,
          file_name: fileName,
          file_size: fileSize,
          mime_type: mimeType || "application/octet-stream",
          file_count: count,
          total_size: total,
          transfer_type: count > 1 ? "batch" : "single",
          status: "waiting",
          expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        })
        .select()
        .single();

      if (error) throw new Error("Failed to create guest session: " + error.message);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            session_id: (data as any).id,
            transfer_code: transferCode,
            transfer_secret: transferSecret,
            sender_name: senderName,
            expires_in_minutes: 15,
            instructions: `Share this code with the receiver. They can enter it at opensendbysparsh.vercel.app/receive`,
          }, null, 2),
        }],
      };
    },
  );

  // ── GET GUEST SESSION ──────────────────────────────────────────────
  server.tool(
    "get_guest_session",
    "Get details of a guest transfer session by its 6-character pair code. Returns session status, sender name, file info, and expiry. Use this to check if a session is still active or if a receiver has joined.",
    {
      code: z.string().length(6).describe("The 6-character pair code from the sender."),
    },
    async ({ code }) => {
      const { data, error } = await getClient()
        .from("opensend_guest_sessions")
        .select("*")
        .eq("transfer_code", code.toUpperCase())
        .single();

      if (error || !data) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ found: false, message: "Session not found. The code may be incorrect or the session has expired." }, null, 2) }],
        };
      }

      const session = data as any;
      const isExpired = new Date(session.expires_at) < new Date();
      const isActive = !isExpired && session.status !== "cancelled" && session.status !== "completed" && session.status !== "expired";

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            found: true,
            is_active: isActive,
            session_id: session.id,
            status: isExpired ? "expired" : session.status,
            sender_name: session.sender_ephemeral_id,
            receiver_name: session.receiver_ephemeral_id || null,
            file_name: session.file_name,
            file_size: session.file_size,
            mime_type: session.mime_type,
            file_count: session.file_count || 1,
            total_size: session.total_size || session.file_size,
            transfer_type: session.transfer_type || "single",
            receiver_joined: !!session.receiver_ephemeral_id,
            created_at: session.created_at,
            expires_at: session.expires_at,
          }, null, 2),
        }],
      };
    },
  );

  // ── GET GUEST TRANSFER BY CODE ────────────────────────────────────
  server.tool(
    "get_transfer_by_claim_code",
    "Get details of a cloud transfer by its claim code (from /t/[code] URL). Use this to check if a cloud transfer is available for download.",
    {
      claimCode: z.string().min(4).max(20).describe("The claim code from the transfer share URL."),
    },
    async ({ claimCode }) => {
      const { data, error } = await getClient()
        .from("opensend_transfers")
        .select("*")
        .eq("claim_code", claimCode)
        .single();

      if (error || !data) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ found: false, message: "Transfer not found." }, null, 2) }],
        };
      }

      const transfer = data as any;
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            found: true,
            file_name: transfer.file_name,
            file_size: transfer.file_size,
            mime_type: transfer.mime_type,
            status: transfer.status,
            download_count: transfer.download_count,
            expires_at: transfer.expires_at,
            is_available: transfer.status === "available" && new Date(transfer.expires_at) > new Date(),
            download_url: `https://opensendbysparsh.vercel.app/t/${claimCode}`,
          }, null, 2),
        }],
      };
    },
  );
}

function generatePairCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
