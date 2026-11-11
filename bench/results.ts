// Shared result-file helpers (used by run.ts, llm/ceiling.ts and table.ts).
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { cpus } from "node:os";
import type { ValidateResult, LatencyResult } from "./harness.ts";

export const resultsDir = join(dirname(fileURLToPath(import.meta.url)), "results");

export interface Machine { node: string; cpu: string; platform: string; }

export interface RouteRun {
  kind: "route";
  route: string;
  date: string;
  machine: Machine;
  coldStartMs: number | null;
  validate: ValidateResult;
  latency: LatencyResult;
}

export interface CeilingRun {
  kind: "ceiling";
  route: "ceiling";
  model: string;
  effort: string;
  date: string;
  machine: Machine;
  total: number;
  passed: number;
  errors: number;
  byClass: Record<string, { passed: number; total: number }>;
  items: unknown[];
}

export function machine(): Machine {
  return { node: process.version, cpu: cpus()[0]?.model ?? "unknown", platform: process.platform };
}

export function saveResult(name: string, data: RouteRun | CeilingRun): string {
  mkdirSync(resultsDir, { recursive: true });
  const file = join(resultsDir, `${name}-${new Date().toISOString().slice(0, 10)}.json`);
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  return file;
}
