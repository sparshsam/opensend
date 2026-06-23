#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { authenticateToken, type Client } from "./supabase.js";
import { registerTransferTools } from "./tools/transfers.js";
import { registerDeviceTools } from "./tools/devices.js";

async function main() {
  const token = process.env.OPENSEND_ACCESS_TOKEN;
  if (!token) {
    console.error(
      "OpenSend MCP server failed to start: OPENSEND_ACCESS_TOKEN is not set.\n" +
      "Generate a token from your OpenSend profile page and set it as an environment variable.",
    );
    process.exit(1);
  }

  let client: Client = null as unknown as Client;
  let userId: string = "";
  try {
    const result = await authenticateToken(token);
    client = result.client;
    userId = result.userId;
  } catch (authError) {
    console.error(
      "OpenSend MCP server failed to start: authentication error.\n" +
      "Error details:",
      authError instanceof Error ? authError.message : String(authError),
    );
    process.exit(1);
  }

  const getClient = () => client;

  const server = new McpServer({
    name: "opensend",
    version: "0.1.1",
  });

  registerTransferTools(server, getClient, userId);
  registerDeviceTools(server, getClient, userId);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(
    "OpenSend MCP server encountered a fatal error and will exit.\n" +
    "Error details:",
    err instanceof Error ? `${err.name}: ${err.message}\n${err.stack}` : String(err),
  );
  process.exit(1);
});
