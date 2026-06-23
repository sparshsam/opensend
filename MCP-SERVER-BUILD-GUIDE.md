# App MCP Server — Build Guide

> A reusable blueprint for adding an MCP (Model Context Protocol) server to any Supabase-backed app, so AI agents can read and write your data through natural language.
>
> Based on the OpenSprout MCP implementation — a production-grade server with 28 tools, user data isolation, token-based auth, comprehensive tests, and a real-world audit.
>
> **What you get:** AI agents (Claude Code, Hermes, Cursor, any MCP client) can connect to your app and execute commands like "Show me my plants due for watering" or "Log that I watered my monstera."

---

## 1. Core Philosophy

### MCP is a read/write bridge for AI agents, not an API.

An API is designed for other developers. An MCP server is designed for AI agents — it provides natural-language-optimized tool descriptions, parameter names that read like English, and error messages that help the agent self-correct.

Key differences from a traditional REST API:

| Aspect | REST API | MCP Server |
|--------|---------|------------|
| Consumer | Developers reading docs | AI agents reading tool descriptions |
| Authentication | API keys in headers | Startup-time token validation, then user-isolated queries |
| Input validation | Manual | Zod schemas auto-generated for each tool |
| Error format | JSON error responses | Descriptive strings the agent can act on |
| Tool discovery | Out-of-band docs | Runtime tool listing via `listTools` |

**Design for the agent, not the developer.** Every tool description, parameter name, and error message should be optimized for an LLM reading it — not a human reading docs.

---

## 2. Architecture Overview

```
┌─────────────┐     stdio JSON-RPC      ┌──────────────────┐
│  AI Agent   │◄──────────────────────►│   MCP Server     │
│  (Claude,   │                         │   (Node.js)      │
│   Hermes,   │                         │                  │
│   Cursor)   │                         │  ┌────────────┐  │
└─────────────┘                         │  │ Auth via   │  │
                                        │  │ SHA-256    │  │
                                        │  │ token hash │  │
                                        │  └──────┬─────┘  │
                                        │         │         │
                                        │  ┌──────▼─────┐  │
                                        │  │ Supabase   │  │
                                        │  │ Service    │  │
                                        │  │ Role       │  │
                                        │  │ Client     │  │
                                        │  └──────┬─────┘  │
                                        │         │         │
                                        └─────────┼─────────┘
                                                  │
                                        ┌─────────▼─────────┐
                                        │   Supabase         │
                                        │   (DB + Auth)      │
                                        └───────────────────┘
```

### How It Works

1. **AI agent starts the MCP server** via stdio with environment variables.
2. **Server validates an access token** at startup by SHA-256 hashing the raw token and matching it against stored hashes in the `mcp_tokens` table.
3. **Server creates a service-role Supabase client** — all subsequent queries filter by `user_id` explicitly. This is critical because the service role bypasses RLS.
4. **Each tool handler** receives the `userId` and `getClient()` function, performs an optional ownership check, executes the query, and returns a JSON string.

---

## 3. Project Setup

### 3a. Directory Structure

Create your MCP server as a workspace package in your monorepo:

```
apps/mcp/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts          # Entry point — server bootstrap
│   ├── supabase.ts       # Auth + Supabase client creation
│   ├── types.ts          # Database type definitions
│   ├── tools/
│   │   ├── plants.ts     # Tool registrations by domain
│   │   ├── care.ts
│   │   ├── journal.ts
│   │   └── ...
│   └── __tests__/
│       ├── auth.test.ts  # Auth validation tests
│       └── tools.test.ts # Input schema + ownership tests
├── dist/                 # Compiled output
└── .env                  # Local dev environment
```

### 3b. package.json

```json
{
  "name": "@your-app/mcp",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "lint": "eslint src/"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.13.0",
    "@supabase/supabase-js": "^2.107.0"
  },
  "devDependencies": {
    "tsx": "^4.0.0",
    "typescript": "^5.8.0",
    "@types/node": "^22.0.0",
    "vitest": "^3.0.0"
  }
}
```

**Key choices:**
- `"type": "module"` — ESM is required for `@modelcontextprotocol/sdk`.
- Only two runtime deps: the MCP SDK and Supabase client. Keep it lean.
- `tsx` for dev (fast, no build step), `tsc` for production builds.

### 3c. tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "src/__tests__"]
}
```

---

## 4. Database Setup (Supabase)

### 4a. Token Storage Table

You need a table to store access token hashes. Access tokens are stored **hashed** (SHA-256) — the raw token is returned to the user once at creation and never stored.

```sql
create table public.mcp_tokens (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  token_hash text not null,
  token_prefix text not null,
  last_used_at timestamptz,
  created_at timestamptz default now(),
  revoked_at timestamptz
);

create index idx_mcp_tokens_user on public.mcp_tokens(user_id);

alter table public.mcp_tokens enable row level security;

create policy "Users manage their own tokens"
  on public.mcp_tokens
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

**Why SHA-256 hashing?** The token is sensitive — it grants full API access. Storing a hash means a DB breach doesn't leak active tokens. The `token_prefix` (e.g., `osp_abc...`) is used in the UI to let users identify tokens without exposing the full hash.

### 4b. Database Types (optional but recommended)

Define TypeScript types for your database tables to get type-safe Supabase queries. Generate them with the Supabase CLI:

```bash
npx supabase gen types typescript --linked > apps/mcp/src/types.ts
```

If your schema is large, just define the types your MCP tools need manually — the generated file can be thousands of lines.

---

## 5. Auth Layer (`supabase.ts`)

This is the most critical file. It handles token authentication and returns a service-role Supabase client scoped to a specific user.

```typescript
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types.js";

export type Client = SupabaseClient<Database>;

function env(key: string): string {
  return process.env[key] ?? "";
}

/**
 * Authenticates an access token:
 * 1. SHA-256 hash the raw token
 * 2. Look up the hash in mcp_tokens (via service-role client)
 * 3. Update last_used_at
 * 4. Return a service-role client + userId
 *
 * All subsequent data queries MUST filter by userId — the application
 * layer enforces user data isolation since the service role bypasses RLS.
 */
export async function authenticateToken(
  rawToken: string,
): Promise<{ client: Client; userId: string }> {
  const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL") || env("SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey =
    env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") || env("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !anonKey) {
    throw new Error(
      "Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  if (!serviceKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY for token validation.");
  }

  // SHA-256 hash the raw token
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(rawToken),
  );
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const tokenHash = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Create service-role client for auth-only queries
  const admin = createClient(supabaseUrl, serviceKey);

  // Look up the token hash
  const { data: records, error: lookupError } = await (admin
    .from("mcp_tokens") as any)
    .select("user_id, id, revoked_at")
    .eq("token_hash", tokenHash);

  if (lookupError)
    throw new Error(
      `Token validation failed: unable to verify access token. ${lookupError.message}`,
    );
  if (!records || records.length === 0) {
    throw new Error(
      "Authentication failed: Invalid access token. The token provided does not match any active token.",
    );
  }

  const record = records[0] as { user_id: string; id: string; revoked_at: string | null };

  if (record.revoked_at) {
    throw new Error(
      "Authentication failed: This access token has been revoked.",
    );
  }

  // Update last_used_at
  await (admin.from("mcp_tokens") as any)
    .update({ last_used_at: new Date().toISOString() } as any)
    .eq("id", record.id);

  // Return a service-role client for data queries
  const client = createClient<Database>(supabaseUrl, serviceKey);
  return { client, userId: record.user_id };
}
```

### Critical design decisions:

1. **Service role client** — The MCP server uses the service role (not the anon key) for all queries. This means **RLS is bypassed** and user isolation must be enforced in application code. This is intentional because the MCP server already authenticated via its own token system.
2. **Every query filters by `user_id`** — Because RLS is bypassed, every read and write query must explicitly filter with `.eq("user_id", userId)`. Missing this filter is a data leak.
3. **Every write verifies ownership** — Before any write operation, do a pre-check query to confirm the target resource belongs to the authenticated user.

---

## 6. Server Entry Point (`index.ts`)

```typescript
#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { authenticateToken } from "./supabase.js";
// Import your tool registrations:
import { registerPlantTools } from "./tools/plants.js";
import { registerCareTools } from "./tools/care.js";

async function main() {
  const token = process.env.YOUR_APP_ACCESS_TOKEN;
  if (!token) {
    console.error(
      "MCP server failed to start: YOUR_APP_ACCESS_TOKEN is not set.\n" +
      "Generate a token from your app and set it as an environment variable.",
    );
    process.exit(1);
  }

  let client: Client;
  let userId: string;
  try {
    const result = await authenticateToken(token);
    client = result.client;
    userId = result.userId;
  } catch (authError) {
    console.error(
      "MCP server failed to start: authentication error.\n" +
      "Error details:",
      authError instanceof Error ? authError.message : String(authError),
    );
    process.exit(1);
  }
  const getClient = () => client;

  const server = new McpServer({
    name: "yourapp",
    version: "1.0.0",
  });

  // Register tool groups
  registerPlantTools(server, getClient, userId);
  registerCareTools(server, getClient, userId);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(
    "MCP server encountered a fatal error and will exit.\n" +
    "Error details:",
    err instanceof Error ? `${err.name}: ${err.message}\n${err.stack}` : String(err),
  );
  process.exit(1);
});
```

**Patterns to note:**
- The server exits with a descriptive error if `TOKEN` is missing or invalid. This prevents a running-but-broken server.
- `getClient()` is a closure — the authenticated client is created once at startup and reused for all tool calls.
- Each domain gets its own registration function, keeping the entry point clean.

---

## 7. Writing Tools — The Pattern

Every tool follows the same structure. Here is the canonical template:

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Client } from "../supabase.js";

export function registerDomainTools(
  server: McpServer,
  getClient: () => Client,
  userId: string,
) {
  // ── READ (list) ──────────────────────────────────────────────────
  server.tool(
    "list_things",                    // Tool name — lowercase, snake_case
    "Natural-language description that tells an AI agent when to use this tool. Be specific about what it returns and why it's useful.",  // Tool description — inline, no markdown
    {
      // Zod schema — each parameter is a named field with a `.describe()` for the AI
      plantId: z.string().optional().describe("Optional filter description"),
      limit: z.number().optional().default(20).describe("Max results"),
    },
    async ({ plantId, limit }) => {   // Handler — destructure params
      let query = getClient()
        .from("things")
        .select("*")
        .eq("user_id", userId);       // REQUIRED: user isolation
        .is("deleted_at", null)       // Soft delete filter

      if (plantId) query = query.eq("plant_id", plantId);

      const { data, error } = await query.order("created_at");

      if (error) throw new Error("Failed to list things: " + error.message);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data ?? [], null, 2) }],
      };
    },
  );

  // ── READ (single) ────────────────────────────────────────────────
  server.tool(
    "get_thing",
    "Get a specific thing by its ID. Returns complete details.",
    {
      thingId: z.string().describe("The ID of the thing to retrieve"),
    },
    async ({ thingId }) => {
      const { data, error } = await getClient()
        .from("things")
        .select("*")
        .eq("id", thingId)
        .eq("user_id", userId)        // REQUIRED: user isolation
        .is("deleted_at", null)
        .single();

      if (error) throw new Error("Failed to get thing: " + error.message);
      return {
        content: [
          {
            type: "text" as const,
            text: data
              ? JSON.stringify(data, null, 2)
              : "Thing not found",
          },
        ],
      };
    },
  );

  // ── WRITE (create) ───────────────────────────────────────────────
  server.tool(
    "create_thing",
    "Create a new thing with optional details. Returns the created record.",
    {
      name: z.string().describe("The thing's name"),
      category: z.string().optional().describe("Optional category"),
      notes: z.string().optional().describe("Optional notes"),
    },
    async ({ name, category, notes }) => {
      const c = getClient() as any;
      const { data, error } = await c
        .from("things")
        .insert({
          name,
          user_id: userId,            // REQUIRED: set user on create
          category: category ?? null,
          notes: notes ?? null,
        })
        .select()
        .single();

      if (error) throw new Error(`Failed to create thing: ${error.message}`);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  // ── WRITE (update — with ownership check) ───────────────────────
  server.tool(
    "update_thing",
    "Update a thing's fields. Only provided fields are changed.",
    {
      thingId: z.string().describe("The ID of the thing to update"),
      name: z.string().optional().describe("New name"),
      notes: z.string().optional().describe("New notes"),
    },
    async ({ thingId, name, notes }) => {
      const updates: Record<string, unknown> = {};
      if (name !== undefined) updates.name = name;
      if (notes !== undefined) updates.notes = notes;

      if (Object.keys(updates).length === 0) {
        return {
          content: [{ type: "text" as const, text: "No fields provided to update." }],
        };
      }

      // OWNERSHIP CHECK: verify the resource belongs to this user
      const { data: existing, error: checkError } = await getClient()
        .from("things")
        .select("id")
        .eq("id", thingId)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .single();

      if (checkError || !existing) {
        throw new Error("Thing not found or access denied");
      }

      const c = getClient() as any;
      const { data, error } = await c
        .from("things")
        .update(updates)
        .eq("id", thingId)
        .select()
        .single();

      if (error) throw new Error("Failed to update thing: " + error.message);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  // ── WRITE (soft-delete) ──────────────────────────────────────────
  server.tool(
    "delete_thing",
    "Soft-delete a thing. It is not permanently removed and can be restored.",
    {
      thingId: z.string().describe("The ID of the thing to delete"),
    },
    async ({ thingId }) => {
      // Ownership check first
      const { data: existing, error: checkError } = await getClient()
        .from("things")
        .select("id")
        .eq("id", thingId)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .single();

      if (checkError || !existing) {
        throw new Error("Thing not found or access denied");
      }

      const c = getClient() as any;
      const { error } = await c
        .from("things")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", thingId);

      if (error) throw new Error(`Failed to delete thing: ${error.message}`);
      return {
        content: [{ type: "text" as const, text: `Thing ${thingId} deleted successfully.` }],
      };
    },
  );

  // ── SEARCH ───────────────────────────────────────────────────────
  server.tool(
    "search_things",
    "Search things by name, category, or description. Use instead of list_things when looking for specific items.",
    {
      query: z.string().describe("Search query to match against name, category, or description"),
    },
    async ({ query }) => {
      const { data, error } = await getClient()
        .from("things")
        .select("*")
        .eq("user_id", userId)
        .or(`name.ilike.%${query}%,category.ilike.%${query}%`)
        .is("deleted_at", null)
        .order("name")
        .limit(50);

      if (error) throw new Error("Failed to search things: " + error.message);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data ?? [], null, 2) }],
      };
    },
  );
}
```

### Tool Writing Rules

1. **Tool names** are `snake_case`, short, and verb-first: `list_things`, `get_thing`, `create_thing`.
2. **Tool descriptions** are complete sentences optimized for AI reading: "List all your things... Use this to...". No markdown, no formatting.
3. **Parameter names** are `camelCase` (JavaScript convention) but the `.describe()` text reads naturally: `"The ID of the thing to retrieve"`.
4. **Enums for constrained fields** — use `z.enum()` with a `as const` array for status values, categories, types:
   ```typescript
   const STATUSES = ["active", "inactive", "archived"] as const;
   status: z.enum(STATUSES).optional().describe("Filter by status"),
   ```
5. **Default values for optional parameters** — `z.number().optional().default(20)`.
6. **Output is always** `{ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] }`.
7. **Error messages are descriptive strings** — the AI reads them and may self-correct: `"Failed to list things: " + error.message`. Never just `throw error`.
8. **`as const` after `"text"`** is required for TypeScript type inference: `{ type: "text" as const, text: ... }`.

---

## 8. User Data Isolation — The Critical Rules

Because the MCP server uses a **service-role Supabase client**, RLS policies are completely bypassed. Every query must enforce user isolation in application code.

### Rule 1: Every read query includes `.eq("user_id", userId)`

```typescript
// ✅ CORRECT — scoped to authenticated user
.from("plants").select("*").eq("user_id", userId)

// ❌ WRONG — exposes ALL users' data
.from("plants").select("*")
```

### Rule 2: Every create includes the userId

```typescript
// ✅ CORRECT — new record belongs to the authenticated user
.insert({ name: "Thing", user_id: userId })

// ❌ WRONG — record has no owner or belongs to wrong user
.insert({ name: "Thing" })
```

### Rule 3: Every mutation does a pre-check ownership query

```typescript
// ✅ CORRECT — verify ownership before update/delete
const { data: existing, error } = await client
  .from("things")
  .select("id")
  .eq("id", thingId)
  .eq("user_id", userId)
  .single();

if (!existing) throw new Error("Thing not found or access denied");

// ❌ WRONG — anyone with a valid token can modify anything
.from("things").update(data).eq("id", thingId)
```

### Rule 4: Soft deletes are always checked

Same ownership check as updates. Always verify before setting `deleted_at`.

---

## 9. Testing

### 9a. Test Structure

Two test files mirror the production code:

- **`auth.test.ts`** — Tests token validation logic (missing credentials, invalid tokens, revoked tokens, SHA-256 computation).
- **`tools.test.ts`** — Tests input schema validation (Zod parsing), output shape, user scoping, and ownership check errors.

### 9b. Mocking the Supabase Query Builder

The Supabase client's `.from().select().eq()...` chain is challenging to type correctly in tests. The key insight: make the chain object **thenable** (has a `.then()` method) so `await chain.eq(...)` resolves properly.

```typescript
function createMockDb() {
  const mockQuery: Record<string, vi.Mock> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
  };

  // Make the chain await-able
  const thenFn = vi.fn((resolve: (v: unknown) => unknown) =>
    resolve({ data: [], error: null }),
  );
  mockQuery["then"] = thenFn;

  for (const [key, mock] of Object.entries(mockQuery)) {
    if (key === "then") continue;
    mock.mockReturnValue(mockQuery);
  }

  return {
    mockClient: { from: vi.fn(() => mockQuery) },
    mockQuery,
  };
}
```

### 9c. What to Test

| Test Category | Examples |
|--------------|---------|
| **Input validation** | Missing required fields throw ZodError. Invalid enum values throw. Valid inputs parse correctly. |
| **Output shape** | Every tool returns `{ content: [{ type: "text", text: expect.any(String) }] }`. |
| **User scoping** | Read tools call `.eq("user_id", userId)`. Create tools set `user_id: userId`. |
| **Ownership checks** | Update/delete tools throw "not found or access denied" when pre-check returns null. |
| **Auth** | Missing env vars throw. Invalid tokens throw. Revoked tokens throw. Valid tokens return `{client, userId}`. |

---

## 10. Special Tool Patterns

### 10a. Search Tools

Search tools are read tools that take a free-text query and do `ilike` matching on multiple columns:

```typescript
.or(`name.ilike.%${query}%,description.ilike.%${query}%`)
```

Always `.limit(50)` search results — unbounded ILIKE queries are expensive.

### 10b. Diagnosis / Lookup Tools

For tables where you search by symptom, tag, or keyword matching multiple columns:

```typescript
.or(`symptom.ilike.%${symptom}%,cause.ilike.%${symptom}%`)
  .order("sort_order")
```

Use `sort_order` to control result priority — the most common/important matches come first.

### 10c. Export Tools

Use `Promise.all` to fetch all user data in parallel:

```typescript
const [plants, schedules, logs] = await Promise.all([
  client.from("plants").select("*").eq("user_id", userId),
  client.from("schedules").select("*").eq("user_id", userId),
  client.from("logs").select("*").eq("user_id", userId),
]);
```

Return a structured JSON object with named keys.

### 10d. Rate-Limited Tools

For paid API calls (e.g., an AI identification service), implement a simple in-memory rate limiter:

```typescript
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_CALLS_PER_WINDOW = 10;
let callTimestamps: number[] = [];

function checkRateLimit(): void {
  const now = Date.now();
  callTimestamps = callTimestamps.filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);
  if (callTimestamps.length >= MAX_CALLS_PER_WINDOW) {
    const retryAfter = RATE_LIMIT_WINDOW_MS - (now - callTimestamps[0]);
    throw new Error(
      `Rate limit exceeded. Max ${MAX_CALLS_PER_WINDOW} calls per minute. Retry in ~${Math.ceil(retryAfter / 1000)}s.`,
    );
  }
  callTimestamps.push(now);
}
```

---

## 11. Configuration for AI Agents

### Hermes Agent

```yaml
# ~/.hermes/config.yaml
mcp_servers:
  yourapp:
    command: "node"
    args: ["/path/to/apps/mcp/dist/index.js"]
```

Set environment variables in `~/.hermes/.env` or in the `env:` block of the MCP server config.

### Claude Code

```json
// ~/.claude/settings.json
{
  "mcpServers": {
    "yourapp": {
      "command": "node",
      "args": ["/path/to/apps/mcp/dist/index.js"],
      "env": {
        "NEXT_PUBLIC_SUPABASE_URL": "https://your-project.supabase.co",
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY": "your-anon-key",
        "YOUR_APP_ACCESS_TOKEN": "tok_abc123..."
      }
    }
  }
}
```

### Cursor

Settings → MCP → Add Server → Command: `node /path/to/apps/mcp/dist/index.js`
Then add the three environment variables in the Cursor MCP server settings.

---

## 12. Token Creation (Web App)

Your web app needs a UI for users to generate MCP access tokens. The token creation endpoint should:

1. Generate a random token string with a prefix (e.g., `app_` + 32 random hex chars).
2. Compute SHA-256 hash of the token.
3. Store the hash + a short prefix (first 10 chars) in `mcp_tokens`.
4. Return the raw token to the user **exactly once**.
5. Display the prefix + creation date so users can identify tokens in a list.

**Token format:** `app_<32-hex-chars>` — the prefix identifies which app the token is for, the hex is the secret.

---

## 13. Common Pitfalls

1. **Missing `.eq("user_id", userId)` on a read query** — This is the #1 data leak. Every read, every write, every filter. If you forget it even once, the agent can read every user's data.

2. **Missing ownership check on a write query** — Without it, user A with a valid token can delete user B's data. The pattern is always: `select("id").eq("id", resourceId).eq("user_id", userId).single()` before the mutation.

3. **Generic error messages** — `throw error` or `throw new Error("Something went wrong")` gives the AI agent nothing to work with. Every error should say what failed and what the agent can do about it: `"Failed to list things: <specific error>. Check that your database connection is configured correctly."`

4. **Trying to use RLS instead of app-level isolation** — The service role bypasses RLS by design. Do not rely on RLS. The application layer is your security boundary.

5. **Not setting `as const` on `"text"`** — TypeScript will complain about the content array type. Always write `{ type: "text" as const, text: ... }`.

6. **Using `createClient` with the anon key** — The anon key cannot read the `mcp_tokens` table. You must use the service role key for auth queries and data queries.

7. **Not filtering soft-deleted records** — Always add `.is("deleted_at", null)` to read queries. Soft-deleted records should be invisible to agents.

8. **Tool names that don't match the function** — The LLM reads the tool name and description to choose the right tool. `list_things` is clear. `get_things_with_filter` is not. Keep names short and verbs precise.

9. **Forgetting `--include-all` on production migrations** — When pushing a new migration to an existing Supabase project, `supabase db push` only pushes migrations not yet recorded in the `_supabase_migrations` table. If you're running this for the first time on a production DB, you need `--include-all` — but that re-runs every migration including type creations. Apply new migrations directly via the Management API SQL endpoint to avoid conflicts.

10. **Writing a tool that returns empty arrays for everything** — If you have a knowledge base or diagnosis table, seed it with real data. An empty MCP server with 25 tools that all return `[]` is useless. Seed data is part of the MCP implementation.

---

## 14. Verification Checklist

Before deploying:

- [ ] Every read query includes `.eq("user_id", userId)`.
- [ ] Every create sets `user_id: userId`.
- [ ] Every update/delete has an ownership pre-check.
- [ ] Soft-deleted records are filtered with `.is("deleted_at", null)`.
- [ ] Tool descriptions are complete sentences optimized for AI reading.
- [ ] Error messages describe the failure and suggest next steps.
- [ ] All enum values are defined as `as const` arrays.
- [ ] Search tools have `.limit()` to prevent unbounded queries.
- [ ] `npm run typecheck` passes with zero errors.
- [ ] `npm run test` passes — all input validation, output shape, user scoping, and ownership tests.
- [ ] `npm run build` produces a clean `dist/` directory.
- [ ] The server starts with a missing token: `process.exit(1)` with a clear error.
- [ ] The server starts with an invalid token: `process.exit(1)` with "Invalid access token".
- [ ] The server starts with a valid token and registers all tools.
- [ ] Every tool returns `{ content: [{ type: "text", text: <JSON> }] }`.
- [ ] Documentation exists for setting up the MCP server in Hermes, Claude Code, and Cursor.

---

## 15. Real-World Audit

After deployment, run the following audit from an AI agent connected to the MCP server:

| # | Test | Expected |
|---|------|----------|
| 1 | List all things | Returns JSON array (empty is fine) |
| 2 | Get a specific thing by ID | Returns full record |
| 3 | Create a thing | Returns created record with ID |
| 4 | Update the thing's name | Returns updated record |
| 5 | List things to confirm the change | Updated name appears |
| 6 | Delete the thing | Returns success message |
| 7 | List things to confirm deletion | Thing no longer appears |
| 8 | Search by name | Returns matching results |
| 9 | Try accessing a non-existent thing | Returns "Thing not found" |
| 10 | Try updating something that doesn't exist | Returns "not found or access denied" |

Each test should succeed with descriptive error messages on failure, not generic errors.

---

## Project References

- **MCP SDK docs**: https://github.com/modelcontextprotocol/typescript-sdk
- **OpenSprout reference implementation**: `apps/mcp/` in the OpenSprout repository
- **Auth pattern**: See `apps/mcp/src/supabase.ts` for the canonical token validation implementation
- **Tool patterns**: See `apps/mcp/src/tools/plants.ts`, `care.ts`, `journal.ts`, `knowledge.ts`
- **Test patterns**: See `apps/mcp/src/__tests__/auth.test.ts` and `tools.test.ts`
- **Database migrations**: See `supabase/migrations/20260619000001_add_mcp_tokens.sql` for the token table schema
