/**
 * OpenSend MCP Server — Vercel HTTP endpoint
 *
 * AI agents connect to: https://opensendbysparsh.vercel.app/api/mcp
 * with Authorization: Bearer *** *
 * Handles JSON-RPC directly (no SDK transport dependency).
 */

import { z } from "zod";
import type { NextRequest } from "next/server";

// ── Auth ──
async function authenticateToken(rawToken: string): Promise<string> {
  if (!rawToken) throw new Error("Authentication required. Provide Bearer token.");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceKey) throw new Error("Server config error.");

  const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawToken));
  const tokenHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");

  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: records } = await (admin.from("opensend_mcp_tokens") as any)
    .select("user_id, id, revoked_at")
    .eq("token_hash", tokenHash);

  if (!records || records.length === 0) throw new Error("Invalid access token.");
  const r = records[0] as { user_id: string; id: string; revoked_at: string | null };
  if (r.revoked_at) throw new Error("Token has been revoked.");
  await (admin.from("opensend_mcp_tokens") as any).update({ last_used_at: new Date().toISOString() }).eq("id", r.id);
  return r.user_id;
}

// ── Supabase queries ──
async function getAdmin() {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const TOOL_DEFINITIONS = [
  {
    name: "lookup_guest_session",
    description: "Look up a guest transfer session by its 6-character pair code. Returns whether it's active, sender name, file info, and if a receiver has joined.",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string", description: "The 6-character pair code from the sender." },
      },
      required: ["code"],
    },
  },
  {
    name: "lookup_transfer_by_code",
    description: "Look up a cloud transfer by its claim code (from a /t/... share link). Returns file name, size, status, and whether it's available for download.",
    inputSchema: {
      type: "object",
      properties: {
        claimCode: { type: "string", description: "The claim code from the transfer share link." },
      },
      required: ["claimCode"],
    },
  },
  {
    name: "list_my_transfers",
    description: "List your recent file transfers. Returns file names, sizes, status, and timestamps for your authenticated transfers.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 20)." },
      },
    },
  },
  {
    name: "describe_server",
    description: "Get information about the OpenSend MCP server and how to use it.",
    inputSchema: { type: "object", properties: {} },
  },
];

async function handleToolCall(name: string, args: unknown) {
  switch (name) {
    case "lookup_guest_session": {
      const { code } = z.object({ code: z.string() }).parse(args);
      const admin = await getAdmin();
      const { data } = await admin.from("opensend_guest_sessions")
        .select("*").eq("transfer_code", code.toUpperCase()).single();
      if (!data) return { content: [{ type: "text", text: JSON.stringify({ found: false }) }] };
      const s = data as any;
      const expired = new Date(s.expires_at) < new Date();
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            found: true,
            active: !expired && s.status === "waiting",
            status: expired ? "expired" : s.status,
            sender: s.sender_ephemeral_id,
            file_name: s.file_name,
            file_size: s.file_size,
            file_count: s.file_count || 1,
            receiver_joined: !!s.receiver_ephemeral_id,
            receiver_name: s.receiver_ephemeral_id || null,
            expires_at: s.expires_at,
          }, null, 2),
        }],
      };
    }

    case "lookup_transfer_by_code": {
      const { claimCode } = z.object({ claimCode: z.string() }).parse(args);
      const admin = await getAdmin();
      const { data } = await admin.from("opensend_transfers")
        .select("*").eq("claim_code", claimCode).single();
      if (!data) return { content: [{ type: "text", text: JSON.stringify({ found: false }) }] };
      const t = data as any;
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            found: true,
            file_name: t.file_name,
            file_size: t.file_size,
            status: t.status,
            download_count: t.download_count,
            available: t.status === "available" && new Date(t.expires_at) > new Date(),
            url: `https://send.kovina.org/t/${claimCode}`,
          }, null, 2),
        }],
      };
    }

    case "list_my_transfers": {
      const { limit } = z.object({ limit: z.number().optional().default(20) }).parse(args);
      const admin = await getAdmin();
      const { data } = await admin.from("opensend_transfers")
        .select("*").order("created_at", { ascending: false }).limit(limit);
      return { content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }] };
    }

    case "describe_server": {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            name: "OpenSend MCP",
            version: "0.3.1",
            tools: TOOL_DEFINITIONS.map(t => t.name),
          }, null, 2),
        }],
      };
    }

    default:
      return { content: [{ type: "text", text: JSON.stringify({ error: `Unknown tool: ${name}` }) }], isError: true };
  }
}

// ── HTTP Handler ──
export async function POST(request: NextRequest) {
  try {
    const auth = request.headers.get("authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "").trim();
    await authenticateToken(token);

    const body = await request.json();
    const { method, params, id } = body;

    if (method === "tools/list") {
      return Response.json({
        jsonrpc: "2.0",
        result: { tools: TOOL_DEFINITIONS },
        id: id ?? null,
      });
    }

    if (method === "tools/call") {
      try {
        const result = await handleToolCall(params.name, params.arguments);
        return Response.json({ jsonrpc: "2.0", result, id: id ?? null });
      } catch (err: any) {
        return Response.json({
          jsonrpc: "2.0",
          error: { code: -32603, message: err.message || "Tool error" },
          id: id ?? null,
        });
      }
    }

    return Response.json({
      jsonrpc: "2.0",
      error: { code: -32601, message: `Unknown method: ${method}` },
      id: id ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    const isAuth = message.toLowerCase().includes("token") || message.toLowerCase().includes("authentication");
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32000, message }, id: null },
      { status: isAuth ? 401 : 500 },
    );
  }
}

export async function GET() {
  return Response.json({
    server: "opensend-mcp",
    version: "0.3.1",
    auth: "Bearer <token>",
    endpoint: "POST /api/mcp with JSON-RPC body",
  });
}
