import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryStore } from "./store.ts";
import * as state from "./state.ts";

test("memory register — M+/MR/MC", async () => {
  const s = new InMemoryStore();
  assert.equal(await state.memRead(s), 0);
  assert.equal(await state.memAdd(s, 15), 15);
  assert.equal(await state.memAdd(s, 10), 25);
  assert.equal(await state.memRead(s), 25);
  await state.memClear(s);
  assert.equal(await state.memRead(s), 0);
});

test("tape — push/list/sum/clear", async () => {
  const s = new InMemoryStore();
  assert.deepEqual(await state.tapeList(s), []);
  assert.equal(await state.tapeSum(s), 0);
  await state.tapePush(s, 25);
  await state.tapePush(s, 25);
  await state.tapePush(s, 10);
  assert.deepEqual(await state.tapeList(s), [25, 25, 10]);
  assert.equal(await state.tapeSum(s), 60);
  await state.tapeClear(s);
  assert.deepEqual(await state.tapeList(s), []);
});

test("stores are isolated per instance", async () => {
  const a = new InMemoryStore(), b = new InMemoryStore();
  await state.memAdd(a, 100);
  assert.equal(await state.memRead(b), 0);
});
