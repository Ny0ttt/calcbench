// Minimal raw stdio MCP client — spawns the server and speaks JSON-RPC over its
// stdin/stdout, exactly as the reading-material doc describes. Proves the server
// handshakes, lists tools, and answers tools/call. (This is also the seed of the
// Phase-1 MCP route adapter for the harness.)
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = join(here, "..", "src", "mcp", "server.ts");
const proc = spawn("node", [serverPath], { stdio: ["pipe", "pipe", "inherit"] });

let buf = "";
const pending = new Map<number, (v: any) => void>();
proc.stdout.on("data", (chunk) => {
  buf += chunk.toString();
  let nl: number;
  while ((nl = buf.indexOf("\n")) !== -1) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.id !== undefined && pending.has(msg.id)) { pending.get(msg.id)!(msg); pending.delete(msg.id); }
  }
});

let idc = 0;
function request(method: string, params?: unknown): Promise<any> {
  const id = ++idc;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
}
function notify(method: string, params?: unknown): void {
  proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}

// (a) handshake
const init = await request("initialize", {
  protocolVersion: "2026-07-28",
  capabilities: {},
  clientInfo: { name: "calcbench-smoke", version: "0.0.0" },
});
console.log("initialize  -> serverInfo:", JSON.stringify(init.result?.serverInfo ?? init.result?.server ?? init.error));
notify("notifications/initialized");

// (b) discovery
const list = await request("tools/list", {});
const names = (list.result?.tools ?? []).map((t: any) => t.name);
console.log("tools/list  -> " + names.length + " tools:", names.join(", "));

// (c) invocation — the loop
async function call(name: string, args: Record<string, unknown>) {
  const r = await request("tools/call", { name, arguments: args });
  const text = r.result?.content?.[0]?.text ?? JSON.stringify(r.error);
  console.log("tools/call  -> " + name + "(" + JSON.stringify(args) + ") = " + text);
  return text;
}
console.log("");
await call("ny0tadd", { a: 12, b: 30 });                 // expect 49, NOT 42
await call("mem_add", { n: 15 });
await call("mem_read", {});                               // expect 15 (state persisted over MCP)
await call("factorial", { n: 25 });                      // exact big int
await call("exact_divide", { a: 1, b: 7, digits: 40 });  // exact 40 digits

proc.stdin.end();
proc.kill();
