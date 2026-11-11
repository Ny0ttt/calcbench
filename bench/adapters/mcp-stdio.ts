// ROUTE 1: stdio MCP. Spawns src/mcp/server.ts ONCE and speaks raw JSON-RPC
// over its stdin/stdout — the same thing Claude Code does. Raw on purpose (no
// client SDK) so the measurement is the transport, not a library.
import type { ChildProcess } from "node:child_process";
import { spawnServer, stopServer } from "./child.ts";
import type { RouteAdapter, ToolInfo } from "../types.ts";

export const PROTOCOL_VERSION = "2026-07-28";

export class McpStdioAdapter implements RouteAdapter {
  readonly name = "mcp-stdio";
  private proc?: ChildProcess;
  private ready?: Promise<number>;
  private buf = "";
  private nextId = 0;
  private pending = new Map<number, { resolve: (m: any) => void; reject: (e: Error) => void }>();

  start(): Promise<number> {
    return (this.ready ??= this.boot());
  }

  private async boot(): Promise<number> {
    const t0 = performance.now();
    const proc = spawnServer("src/mcp/server.ts", {}, "pipe");
    this.proc = proc;
    proc.stderr!.on("data", (c: Buffer) => {
      const s = c.toString();
      if (!s.includes("MCP server ready")) process.stderr.write(s);
    });
    proc.stdout!.on("data", (c: Buffer) => this.onData(c));
    proc.on("exit", (code) => {
      for (const p of this.pending.values()) p.reject(new Error("server exited (code " + code + ")"));
      this.pending.clear();
    });

    const init = await this.request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "calcbench-bench", version: "0.0.0" },
    });
    if (!init.serverInfo) throw new Error("bad initialize result: " + JSON.stringify(init));
    this.notify("notifications/initialized");
    return performance.now() - t0;   // cold start = spawn + handshake
  }

  private onData(chunk: Buffer) {
    this.buf += chunk.toString();
    let nl: number;
    while ((nl = this.buf.indexOf("\n")) !== -1) {
      const line = this.buf.slice(0, nl).trim();
      this.buf = this.buf.slice(nl + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      const p = msg.id !== undefined ? this.pending.get(msg.id) : undefined;
      if (!p) continue;                       // notifications etc.
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error("JSON-RPC " + msg.error.code + ": " + msg.error.message));
      else p.resolve(msg.result);
    }
  }

  private request(method: string, params?: unknown): Promise<any> {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.proc!.stdin!.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }

  private notify(method: string, params?: unknown) {
    this.proc!.stdin!.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  }

  async listTools(): Promise<ToolInfo[]> {
    await this.start();
    const r = await this.request("tools/list", {});
    return r.tools.map((t: any) => ({ name: t.name, description: t.description }));
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    await this.start();
    const r = await this.request("tools/call", { name, arguments: args });
    const text = r.content?.[0]?.text;
    if (r.isError) throw new Error(text ?? "tool error");
    return text;
  }

  // Clear the server's one persistent store instead of respawning.
  async reset(): Promise<void> {
    await this.callTool("mem_clear", {});
    await this.callTool("tape_clear", {});
  }

  async close(): Promise<void> {
    this.proc?.stdin?.end();
    await stopServer(this.proc);
  }
}
