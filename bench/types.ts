// Harness contracts. A RouteAdapter is how the harness talks to ONE route
// (direct call, stdio-MCP, HTTP-MCP, ...). Every route implements this, so the
// same dataset runs identically across all of them — that is the whole point.

export interface ToolInfo { name: string; description: string; }

export interface RouteAdapter {
  readonly name: string;
  // Starts the route (spawn server, handshake). Returns cold-start ms, or
  // undefined for in-process routes. Other methods call it implicitly.
  start?(): Promise<number | undefined>;
  listTools(): Promise<ToolInfo[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
  reset?(): Promise<void>;   // clear per-scenario state (fresh memory + tape)
  close?(): Promise<void>;
}

export interface ToolCall { name: string; args: Record<string, unknown>; }

export interface Prompt {
  id: string;
  class: string;
  prompt: string;
  calls: ToolCall[];      // ground-truth tool sequence
  expected: string;       // normalized expected final answer
}

export interface Dataset { version: number; note: string; prompts: Prompt[]; }

// Normalize any tool result to a comparable string, matching how `expected`
// is written in the dataset. Single definition lives in calc-core.
export { normalize } from "../src/calc-core/index.ts";
