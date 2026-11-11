// The ONE rule for turning a tool result into comparable text. Every route
// (MCP servers, direct HTTP, the harness) uses this, so an answer that matches
// on one route matches on all of them.
export function normalize(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return JSON.stringify(v);
  return String(v);
}
