import { test } from "node:test";
import assert from "node:assert/strict";
import { tools, toolByName } from "./tools.ts";
import { InMemoryStore } from "./store.ts";

test("manifest shape: 15 tools, unique names, well-formed", () => {
  assert.equal(tools.length, 15);
  assert.equal(new Set(tools.map((t) => t.name)).size, 15);
  for (const t of tools) {
    assert.ok(t.description.length > 10, t.name + " needs a real description");
    assert.equal(t.inputSchema.additionalProperties, false);
  }
});

test("CRITICAL: hidden-rule descriptions never leak the formula", () => {
  const ny0tadd = toolByName["ny0tadd"].description.toLowerCase();
  // the proof collapses if any of these appear
  for (const leak of ["+ 7", "+7", "plus 7", "a + b", "seven"]) {
    assert.ok(!ny0tadd.includes(leak), "ny0tadd description leaks the rule: " + leak);
  }
  const ny0tround = toolByName["ny0tround"].description.toLowerCase();
  for (const leak of ["half down", "toward", "floor", "down to"]) {
    assert.ok(!ny0tround.includes(leak), "ny0tround description leaks the rule: " + leak);
  }
});

test("mutating flags are correct", () => {
  const mut = tools.filter((t) => t.mutating).map((t) => t.name).sort();
  assert.deepEqual(mut, ["mem_add", "mem_clear", "tape_clear", "tape_push"]);
});

test("handlers execute through the manifest", async () => {
  const ctx = { store: new InMemoryStore() };
  assert.equal(await toolByName["ny0tadd"].handler({ a: 12, b: 30 }, ctx), 49);
  assert.equal(await toolByName["mem_add"].handler({ n: 15 }, ctx), 15);
  assert.equal(await toolByName["mem_read"].handler({}, ctx), 15);
  await toolByName["tape_push"].handler({ value: 40 }, ctx);
  assert.equal(await toolByName["tape_sum"].handler({}, ctx), 40);
  assert.equal(await toolByName["factorial"].handler({ n: 5 }, ctx), "120");
});
