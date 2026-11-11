// The harness. Two independent measurements, both route-agnostic:
//   1. validate(dataset)  -- replay ground-truth calls, check expected answers
//                            (also what an LLM run will later be scored against)
//   2. latency(call, n)   -- transport cost of callTool with NO LLM in the loop
import { normalize } from "./types.ts";
import type { RouteAdapter, Dataset, Prompt } from "./types.ts";

export interface PromptResult { id: string; class: string; ok: boolean; got: string; expected: string; }
export interface ValidateResult {
  route: string; total: number; passed: number;
  byClass: Record<string, { passed: number; total: number }>;
  failures: PromptResult[];
}

export async function validate(adapter: RouteAdapter, ds: Dataset): Promise<ValidateResult> {
  const results: PromptResult[] = [];
  for (const p of ds.prompts) {
    if (adapter.reset) await adapter.reset();   // fresh state per prompt
    let got = "";
    try {
      let last: unknown = undefined;
      for (const c of p.calls) last = await adapter.callTool(c.name, c.args);
      got = normalize(last);
    } catch (e) {
      got = "ERROR: " + (e instanceof Error ? e.message : String(e));
    }
    results.push({ id: p.id, class: p.class, ok: got === p.expected, got, expected: p.expected });
  }
  const byClass: Record<string, { passed: number; total: number }> = {};
  for (const r of results) {
    (byClass[r.class] ??= { passed: 0, total: 0 }).total++;
    if (r.ok) byClass[r.class].passed++;
  }
  return {
    route: adapter.name,
    total: results.length,
    passed: results.filter((r) => r.ok).length,
    byClass,
    failures: results.filter((r) => !r.ok),
  };
}

export interface LatencyResult { route: string; n: number; p50: number; p95: number; p99: number; meanMs: number; }

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i];
}

export async function latency(
  adapter: RouteAdapter, name: string, args: Record<string, unknown>, n = 200,
): Promise<LatencyResult> {
  if (adapter.reset) await adapter.reset();
  await adapter.callTool(name, args);           // warm up
  const samples: number[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    await adapter.callTool(name, args);
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  return { route: name === "" ? adapter.name : adapter.name, n, p50: pct(samples, 50), p95: pct(samples, 95), p99: pct(samples, 99), meanMs: mean };
}
