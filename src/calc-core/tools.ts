// The tool manifest: the single source of truth for what the model sees.
// The MCP server, the direct-HTTP baseline, and the schema generator all
// derive from THIS. Descriptions for ny0tadd/ny0tround deliberately OMIT the
// rule — leaking it would let the model answer without calling the tool.
import type { Store } from "./store.ts";
import * as ops from "./ops.ts";
import * as state from "./state.ts";

export interface ToolContext { store: Store; }

export interface JSONSchema {
  type: "object";
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties: false;
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  mutating: boolean;
  handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
}

const num = (desc: string) => ({ type: "number", description: desc });
const int = (desc: string, min?: number, max?: number) => ({
  type: "integer", description: desc,
  ...(min !== undefined ? { minimum: min } : {}),
  ...(max !== undefined ? { maximum: max } : {}),
});
const obj = (properties: Record<string, unknown>, required: string[]): JSONSchema =>
  ({ type: "object", properties, required, additionalProperties: false });

function n(args: Record<string, unknown>, key: string): number {
  const v = args[key];
  if (typeof v !== "number" || Number.isNaN(v)) throw new Error("missing/invalid number: " + key);
  return v;
}

export const tools: Tool[] = [
  // --- Baseline arithmetic: guessable, latency-only, excluded from accuracy ---
  { name: "add", mutating: false, description: "Add two numbers and return the sum.",
    inputSchema: obj({ a: num("first addend"), b: num("second addend") }, ["a", "b"]),
    handler: async (a) => ops.add(n(a, "a"), n(a, "b")) },
  { name: "subtract", mutating: false, description: "Subtract b from a and return the difference.",
    inputSchema: obj({ a: num("minuend"), b: num("subtrahend") }, ["a", "b"]),
    handler: async (a) => ops.subtract(n(a, "a"), n(a, "b")) },
  { name: "multiply", mutating: false, description: "Multiply two numbers and return the product.",
    inputSchema: obj({ a: num("first factor"), b: num("second factor") }, ["a", "b"]),
    handler: async (a) => ops.multiply(n(a, "a"), n(a, "b")) },
  { name: "divide", mutating: false, description: "Divide a by b and return the quotient. Errors if b is 0.",
    inputSchema: obj({ a: num("dividend"), b: num("divisor") }, ["a", "b"]),
    handler: async (a) => ops.divide(n(a, "a"), n(a, "b")) },

  // --- Hidden operations: invocation proofs. FORMULA NEVER STATED. ---
  { name: "ny0tadd", mutating: false,
    description: "Compute the \"Ny0t total\" of two numbers. This is a calculator-specific operation defined by this app's internal rules — it is NOT ordinary addition and you cannot derive the result yourself. Always call this tool to obtain it. Returns one number.",
    inputSchema: obj({ a: num("first value"), b: num("second value") }, ["a", "b"]),
    handler: async (a) => ops.ny0tadd(n(a, "a"), n(a, "b")) },
  { name: "ny0tround", mutating: false,
    description: "Round a number to 1 decimal place using this calculator's own rounding rule, which is not necessarily standard rounding. Call this tool rather than rounding the value yourself.",
    inputSchema: obj({ x: num("value to round") }, ["x"]),
    handler: async (a) => ops.ny0tround(n(a, "x")) },

  // --- Precision: proofs by exactness the model can't match ---
  { name: "exact_divide", mutating: false,
    description: "Divide a by b to an exact number of decimal places (up to 60), with no floating-point error. Operands must be integers. Use whenever exact high-precision division is needed; do not approximate it yourself. Returns a decimal string.",
    inputSchema: obj({ a: int("dividend (integer)"), b: int("divisor (integer, non-zero)"), digits: int("decimal places", 0, 60) }, ["a", "b", "digits"]),
    handler: async (a) => ops.exactDiv(n(a, "a"), n(a, "b"), n(a, "digits")) },
  { name: "factorial", mutating: false,
    description: "Return the exact factorial of a non-negative integer n (max 200), as a full integer with every digit. Use for factorials too large to compute by hand. Returns an integer string.",
    inputSchema: obj({ n: int("non-negative integer", 0, 200) }, ["n"]),
    handler: async (a) => ops.factorial(n(a, "n")) },

  // --- Memory register: airtight state proof (M+/MR/MC) ---
  { name: "mem_add", mutating: true,
    description: "Add a number to this calculator's memory register (the M+ key). The register persists across calls in this session. Returns the new register value.",
    inputSchema: obj({ n: num("amount to add") }, ["n"]),
    handler: async (a, ctx) => state.memAdd(ctx.store, n(a, "n")) },
  { name: "mem_read", mutating: false,
    description: "Return the current value in this calculator's memory register (the MR key). Only this tool can tell you the value.",
    inputSchema: obj({}, []),
    handler: async (_a, ctx) => state.memRead(ctx.store) },
  { name: "mem_clear", mutating: true,
    description: "Reset this calculator's memory register to 0 (the MC key).",
    inputSchema: obj({}, []),
    handler: async (_a, ctx) => { await state.memClear(ctx.store); return "ok"; } },

  // --- Tape: airtight state proof (a running list) ---
  { name: "tape_push", mutating: true,
    description: "Append a number to this calculator's running tape (its history of entries).",
    inputSchema: obj({ value: num("number to append") }, ["value"]),
    handler: async (a, ctx) => { await state.tapePush(ctx.store, n(a, "value")); return "ok"; } },
  { name: "tape_list", mutating: false,
    description: "Return every number currently on the tape, in order.",
    inputSchema: obj({}, []),
    handler: async (_a, ctx) => state.tapeList(ctx.store) },
  { name: "tape_sum", mutating: false,
    description: "Return the sum of all numbers currently on the tape.",
    inputSchema: obj({}, []),
    handler: async (_a, ctx) => state.tapeSum(ctx.store) },
  { name: "tape_clear", mutating: true,
    description: "Remove all entries from the tape, leaving it empty.",
    inputSchema: obj({}, []),
    handler: async (_a, ctx) => { await state.tapeClear(ctx.store); return "ok"; } },
];

export const toolByName: Record<string, Tool> =
  Object.fromEntries(tools.map((t) => [t.name, t]));
