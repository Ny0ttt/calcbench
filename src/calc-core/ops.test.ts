import { test } from "node:test";
import assert from "node:assert/strict";
import * as ops from "./ops.ts";

test("baseline arithmetic", () => {
  assert.equal(ops.add(2, 3), 5);
  assert.equal(ops.subtract(10, 4), 6);
  assert.equal(ops.multiply(6, 7), 42);
  assert.equal(ops.divide(20, 5), 4);
  assert.throws(() => ops.divide(1, 0));
});

test("ny0tadd — hidden rule, the Phase 1 gate", () => {
  // Must be 49, not 42. A model that guesses 'add' gets 42; only a real call yields 49.
  assert.equal(ops.ny0tadd(12, 30), 49);
  assert.equal(ops.ny0tadd(0, 0), 7);
  assert.equal(ops.ny0tadd(-7, 0), 0);
});

test("ny0tround — half DOWN, only differs on exact .x5 (binary-exact inputs)", () => {
  assert.equal(ops.ny0tround(2.25), 2.2); // standard rounding would give 2.3
  assert.equal(ops.ny0tround(2.75), 2.7); // standard -> 2.8
  assert.equal(ops.ny0tround(2.24), 2.2); // matches normal
  assert.equal(ops.ny0tround(2.26), 2.3); // matches normal
  assert.equal(ops.ny0tround(-2.25), -2.3); // half down = toward -Infinity
});

test("exactDiv — exact truncated digits as string", () => {
  assert.equal(ops.exactDiv(1, 7, 6), "0.142857");
  assert.equal(ops.exactDiv(1, 7, 40), "0." + "142857".repeat(6) + "1428");
  assert.equal(ops.exactDiv(10, 4, 2), "2.50");
  assert.equal(ops.exactDiv(7, 1, 0), "7");
  assert.equal(ops.exactDiv(-1, 7, 3), "-0.142");
  assert.throws(() => ops.exactDiv(1, 0, 5));
  assert.throws(() => ops.exactDiv(1.5, 2, 5));
  assert.throws(() => ops.exactDiv(1, 7, 61));
});

test("factorial — exact big integer as string", () => {
  assert.equal(ops.factorial(0), "1");
  assert.equal(ops.factorial(5), "120");
  assert.equal(ops.factorial(20), "2432902008176640000");
  assert.equal(ops.factorial(25), "15511210043330985984000000");
  assert.throws(() => ops.factorial(-1));
  assert.throws(() => ops.factorial(201));
});
