import { describe, it, expect, vi, beforeEach } from "vitest";

describe("transfer tools", () => {
  let getClient: () => any;
  let mockQuery: Record<string, any>;

  beforeEach(() => {
    mockQuery = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
    };

    // Make chain thenable - default returns empty data
    mockQuery.then = vi.fn((resolve: any) => resolve({ data: [], error: null }));

    // All chain methods return the mockQuery itself
    for (const key of Object.keys(mockQuery)) {
      if (key !== "then") {
        mockQuery[key].mockReturnValue(mockQuery);
      }
    }

    getClient = () => ({ from: vi.fn(() => mockQuery) });
    vi.resetModules();
  });

  describe("tool registration", () => {
    it("registers all four transfer tools", async () => {
      const { registerTransferTools } = await import("../tools/transfers.js");
      const tools: string[] = [];
      const server = {
        tool: vi.fn((name: string) => { tools.push(name); }),
      } as any;

      registerTransferTools(server, getClient, "test-user");

      expect(tools).toEqual([
        "list_my_transfers",
        "get_transfer",
        "delete_transfer",
        "export_transfer_history",
      ]);
    });

    it("each handler returns content shape", async () => {
      const { registerTransferTools } = await import("../tools/transfers.js");
      const handlers = new Map<string, Function>();
      const server = {
        tool: vi.fn((name: string, _desc: string, _schema: any, handler: Function) => {
          handlers.set(name, handler);
        }),
      } as any;

      registerTransferTools(server, getClient, "test-user");

      for (const [name, handler] of handlers) {
        const result = await handler({});
        expect(result).toHaveProperty("content");
        expect(Array.isArray(result.content)).toBe(true);
        expect(result.content[0]).toHaveProperty("type", "text");
        expect(typeof result.content[0].text).toBe("string");
      }
    });
  });

  describe("user data isolation", () => {
    it("queries include user_id filter", async () => {
      const { registerTransferTools } = await import("../tools/transfers.js");
      let capturedEqArgs: string[] = [];
      mockQuery.eq = vi.fn((field: string, _val: any) => {
        capturedEqArgs.push(field);
        return mockQuery;
      });

      const handlers = new Map<string, Function>();
      const server = {
        tool: vi.fn((name: string, _desc: string, _schema: any, handler: Function) => {
          handlers.set(name, handler);
        }),
      } as any;

      registerTransferTools(server, getClient, "test-user");

      // Call list handler
      const listHandler = handlers.get("list_my_transfers")!;
      capturedEqArgs = [];
      await listHandler({});

      // Should have queried with user_id filter
      expect(capturedEqArgs).toContain("user_id");
    });
  });

  describe("ownership checks on mutations", () => {
    it("delete_transfer throws when ownership check fails", async () => {
      // Make the pre-check return no data
      mockQuery.then = vi.fn((resolve: any) => resolve({ data: null, error: { message: "not found" } }));
      mockQuery.single = vi.fn(() => mockQuery);

      const { registerTransferTools } = await import("../tools/transfers.js");
      const handlers = new Map<string, Function>();
      const server = {
        tool: vi.fn((name: string, _desc: string, _schema: any, handler: Function) => {
          handlers.set(name, handler);
        }),
      } as any;

      registerTransferTools(server, getClient, "test-user");

      const deleteHandler = handlers.get("delete_transfer")!;
      await expect(deleteHandler({ transferId: "nonexistent" })).rejects.toThrow(
        "Transfer not found or access denied",
      );
    });
  });
});
