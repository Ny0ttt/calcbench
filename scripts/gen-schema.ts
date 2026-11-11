// Generates src/calc-core/tools.schema.json from the manifest — one source of
// truth. The MCP server, the direct-HTTP baseline, and the later UI all read
// this instead of hand-maintaining copies.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tools } from "../src/calc-core/tools.ts";

const out = tools.map((t) => ({
  name: t.name,
  description: t.description,
  mutating: t.mutating,
  inputSchema: t.inputSchema,
}));

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, "..", "src", "calc-core", "tools.schema.json");
writeFileSync(target, JSON.stringify(out, null, 2) + "\n");
console.log("wrote " + target + " (" + out.length + " tools)");
