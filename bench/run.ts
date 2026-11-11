// CLI: run the harness against one route (or all), print results, and save
// them to bench/results/<route>-<date>.json for the table.
//
//   node bench/run.ts direct | mcp-stdio | mcp-http | http-direct | all
//   node bench/run.ts ceiling          (needs ANTHROPIC_API_KEY; see bench/llm/ceiling.ts)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { DirectAdapter } from "./adapters/direct.ts";
import { McpStdioAdapter } from "./adapters/mcp-stdio.ts";
import { McpHttpAdapter } from "./adapters/mcp-http.ts";
import { HttpDirectAdapter } from "./adapters/http-direct.ts";
import { validate, latency } from "./harness.ts";
import { machine, saveResult } from "./results.ts";
import type { RouteRun } from "./results.ts";
import type { Dataset, RouteAdapter } from "./types.ts";

const here = dirname(fileURLToPath(import.meta.url));
const ds: Dataset = JSON.parse(readFileSync(join(here, "prompts.json"), "utf8"));

const adapters: Record<string, () => RouteAdapter> = {
  "direct": () => new DirectAdapter(),
  "mcp-stdio": () => new McpStdioAdapter(),
  "mcp-http": () => new McpHttpAdapter(),
  "http-direct": () => new HttpDirectAdapter(),
};

async function runRoute(which: string): Promise<void> {
  const adapter = adapters[which]();
  try {
    const cold = adapter.start ? await adapter.start() : undefined;
    const v = await validate(adapter, ds);
    console.log("\n=== route=" + v.route + " ===");
    console.log("accuracy (ground-truth calls -> expected): " + v.passed + "/" + v.total);
    for (const [cls, s] of Object.entries(v.byClass)) console.log("  " + cls.padEnd(12) + s.passed + "/" + s.total);
    for (const f of v.failures) console.log("  FAIL " + f.id + " [" + f.class + "] got=" + f.got + " expected=" + f.expected);

    const lat = await latency(adapter, "ny0tadd", { a: 12, b: 30 }, 200);
    console.log("latency, no LLM (ny0tadd, n=" + lat.n + "): p50=" + lat.p50.toFixed(4) + "ms  p95=" + lat.p95.toFixed(4) +
      "ms  p99=" + lat.p99.toFixed(4) + "ms  mean=" + lat.meanMs.toFixed(4) + "ms");
    console.log("cold start: " + (cold === undefined ? "n/a (in-process)" : cold.toFixed(1) + "ms"));

    const run: RouteRun = {
      kind: "route", route: which, date: new Date().toISOString(), machine: machine(),
      coldStartMs: cold ?? null, validate: v, latency: lat,
    };
    console.log("saved: " + saveResult(which, run));
  } finally {
    if (adapter.close) await adapter.close();
  }
}

const which = process.argv[2] ?? "direct";
if (which === "ceiling") {
  await import("./llm/ceiling.ts");
} else if (which === "all") {
  for (const r of Object.keys(adapters)) await runRoute(r);   // one at a time, never in parallel
  console.log("\nnext: node bench/table.ts");
} else if (adapters[which]) {
  await runRoute(which);
} else {
  console.error("unknown route: " + which + " (have: " + [...Object.keys(adapters), "all", "ceiling"].join(", ") + ")");
  process.exit(1);
}
