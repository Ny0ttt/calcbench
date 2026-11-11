// Shared by every MCP server (stdio + HTTP): builds an McpServer with all
// manifest tools registered against the given store. One registration loop,
// so the two MCP routes cannot drift apart.
import { McpServer, fromJsonSchema } from "@modelcontextprotocol/server";
import { tools, normalize } from "../calc-core/index.ts";
import type { Store } from "../calc-core/index.ts";

/** Fired after every tool call (used by the live demo; the benchmark passes none). */
export type ToolCallHook = (call: { tool: string; args: Record<string, unknown>; result?: unknown; error?: string }) => void | Promise<void>;

export function buildServer(store: Store, onCall?: ToolCallHook): McpServer {
  const server = new McpServer({ name: "calcbench", version: "0.0.0" });
  for (const t of tools) {
    server.registerTool(
      t.name,
      // The manifest types property schemas as `unknown`; they are plain JSON
      // Schema objects (checked by tools.test.ts), so this cast is safe.
      { description: t.description, inputSchema: fromJsonSchema(t.inputSchema as Parameters<typeof fromJsonSchema>[0]) },
      async (args: unknown) => {
        const a = (args ?? {}) as Record<string, unknown>;
        if (!onCall) {
          const result = await t.handler(a, { store });
          return { content: [{ type: "text" as const, text: normalize(result) }] };
        }
        try {
          const result = await t.handler(a, { store });
          await onCall({ tool: t.name, args: a, result });
          return { content: [{ type: "text" as const, text: normalize(result) }] };
        } catch (e) {
          await onCall({ tool: t.name, args: a, error: e instanceof Error ? e.message : String(e) });
          throw e;
        }
      },
    );
  }
  return server;
}
