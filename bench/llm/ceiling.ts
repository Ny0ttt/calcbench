// CEILING CONTROL: the 40 prompts sent to Claude with NO tools. It must score
// about 0/40 — if it does well, the dataset is guessable and no accuracy number
// from any route can be trusted.
//
//   ANTHROPIC_API_KEY=... node bench/run.ts ceiling
//
// Effort is set to "high" on purpose: the ceiling gives the model its best shot
// at guessing, so a low score is a strong result, not a weak one.
// Cost: 40 short requests per run.
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { normalize } from "../types.ts";
import type { Dataset, Prompt } from "../types.ts";
import { machine, saveResult } from "../results.ts";

const MODEL = "claude-opus-5-5";
const CONCURRENCY = 4;
const here = dirname(fileURLToPath(import.meta.url));
const ds: Dataset = JSON.parse(readFileSync(join(here, "..", "prompts.json"), "utf8"));

const SYSTEM =
  "You are answering questions about a calculator app. You have no tools and no access to the app. " +
  "Answer as best you can. End your reply with one final line of the form `ANSWER: <value>` containing only the value " +
  "(a number, a decimal string, or a JSON array). If you cannot determine it, write `ANSWER: unknown`.";

export interface CeilingItem {
  id: string; class: string; ok: boolean; got: string; expected: string;
  stopReason: string | null; servedBy: string;
}

function extractAnswer(text: string): string {
  const m = [...text.matchAll(/^\s*ANSWER:\s*(.+?)\s*$/gim)].at(-1);
  if (!m) return "NO_ANSWER_LINE";
  return normalize(m[1].replace(/^`|`$/g, "").trim());
}

async function ask(client: Anthropic, p: Prompt): Promise<CeilingItem> {
  // Refusal fallback on (server picks a fallback model if Opus 5.5 declines).
  // Calculator prompts shouldn't trigger it; servedBy records it if they do.
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "high" },
    system: SYSTEM,
    messages: [{ role: "user", content: p.prompt }],
  });
  let got: string;
  if (response.stop_reason === "refusal") {
    got = "REFUSED";
  } else {
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
    got = extractAnswer(text);
  }
  return {
    id: p.id, class: p.class, ok: got === p.expected, got, expected: p.expected,
    stopReason: response.stop_reason, servedBy: response.model,
  };
}

const client = new Anthropic();   // ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or an `ant auth login` profile
const items: CeilingItem[] = new Array(ds.prompts.length);
let next = 0;
async function worker() {
  while (next < ds.prompts.length) {
    const i = next++;
    const p = ds.prompts[i];
    try {
      items[i] = await ask(client, p);
    } catch (e) {
      // Bad/missing credentials, or a client-side setup error (thrown before any
      // request is sent): stop the whole run and save nothing.
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError || !(e instanceof Anthropic.APIError)) {
        console.error("\nCeiling aborted, nothing saved: " + (e instanceof Error ? e.message : String(e)));
        console.error("Set ANTHROPIC_API_KEY (or run `ant auth login`) and rerun.");
        process.exit(1);
      }
      // A per-request API failure (rate limit, overload...): record it and carry on.
      items[i] = { id: p.id, class: p.class, ok: false, got: `ERROR: API ${e.status}: ${e.message}`, expected: p.expected, stopReason: null, servedBy: MODEL };
    }
    process.stderr.write(".");
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
process.stderr.write("\n");

const errors = items.filter((r) => r.got.startsWith("ERROR"));
if (errors.length === items.length) {
  console.error("\nCeiling aborted, nothing saved: every request errored. First error:\n  " + errors[0].got);
  process.exit(1);
}
const passed = items.filter((r) => r.ok).length;
const byClass: Record<string, { passed: number; total: number }> = {};
for (const r of items) {
  (byClass[r.class] ??= { passed: 0, total: 0 }).total++;
  if (r.ok) byClass[r.class].passed++;
}

console.log("\n=== CEILING (" + MODEL + ", no tools, effort high) ===");
console.log("correct without tools: " + passed + "/" + items.length + "   (want ≈ 0)");
for (const [cls, s] of Object.entries(byClass)) console.log("  " + cls.padEnd(12) + s.passed + "/" + s.total);
const leaks = items.filter((r) => r.ok);
if (leaks.length) {
  console.log("GUESSABLE — answered correctly with no tools (fix these prompts):");
  for (const r of leaks) console.log("  " + r.id + " [" + r.class + "] " + r.got);
}
if (errors.length) console.log(errors.length + " request(s) errored — rerun before trusting this row.");
const fallbacks = items.filter((r) => r.servedBy !== MODEL);
if (fallbacks.length) console.log(fallbacks.length + " answer(s) came from a fallback model after a refusal.");

console.log("saved: " + saveResult("ceiling", {
  kind: "ceiling", route: "ceiling", model: MODEL, effort: "high",
  date: new Date().toISOString(), machine: machine(),
  total: items.length, passed, errors: errors.length, byClass, items,
}));
