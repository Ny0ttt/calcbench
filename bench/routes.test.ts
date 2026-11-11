// Every transport route must return exactly what the direct route returns,
// and reset() must give each prompt fresh state. Uses non-default ports so it
// can run while a real server is up on 8787/8788.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { McpStdioAdapter } from "./adapters/mcp-stdio.ts";
import { McpHttpAdapter } from "./adapters/mcp-http.ts";
import { HttpDirectAdapter } from "./adapters/http-direct.ts";
import { validate } from "./harness.ts";
import type { Dataset, RouteAdapter } from "./types.ts";

const ds: Dataset = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "prompts.json"), "utf8"));

const routes: [string, () => RouteAdapter][] = [
  ["mcp-stdio", () => new McpStdioAdapter()],
  ["mcp-http", () => new McpHttpAdapter(18787)],
  ["http-direct", () => new HttpDirectAdapter(18788)],
];

for (const [name, make] of routes) {
  test(`${name}: lists 15 tools, validates 40/40, reset isolates state, errors surface`, async () => {
    const a = make();
    try {
      assert.equal((await a.listTools()).length, 15);
      const v = await validate(a, ds);
      if (v.failures.length) console.error(v.failures);
      assert.equal(v.passed, 40);
      await a.callTool("mem_add", { n: 999 });
      await a.reset!();
      assert.equal(String(await a.callTool("mem_read", {})), "0");
      await assert.rejects(a.callTool("divide", { a: 1, b: 0 }));
    } finally {
      await a.close!();
    }
  });
}
