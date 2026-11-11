import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { DirectAdapter } from "./adapters/direct.ts";
import { validate } from "./harness.ts";
import type { Dataset } from "./types.ts";

const here = dirname(fileURLToPath(import.meta.url));
const ds: Dataset = JSON.parse(readFileSync(join(here, "prompts.json"), "utf8"));

test("dataset is internally consistent: every prompt's ground truth yields its expected answer", async () => {
  const v = await validate(new DirectAdapter(), ds);
  if (v.failures.length) console.error(v.failures);
  assert.equal(v.passed, v.total, "all " + v.total + " prompts must validate");
  assert.equal(v.total, 40);
});

test("state is isolated between prompts (reset works)", async () => {
  const a = new DirectAdapter();
  await a.callTool("mem_add", { n: 999 });
  await a.reset();
  assert.equal(await a.callTool("mem_read", {}), 0);
});
