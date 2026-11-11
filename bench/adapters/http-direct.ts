// ROUTE 3: direct HTTP, no MCP. Starts src/http/server.ts and calls it with
// fetch(): POST /tools/:name {args} -> {result}. No handshake, no JSON-RPC,
// no session — the difference from route 2 is the cost of MCP itself.
import type { ChildProcess } from "node:child_process";
import { spawnServer, waitForStderr, stopServer } from "./child.ts";
import type { RouteAdapter, ToolInfo } from "../types.ts";

export class HttpDirectAdapter implements RouteAdapter {
  readonly name = "http-direct";
  private proc?: ChildProcess;
  private ready?: Promise<number>;
  private base: string;

  private port: number;

  constructor(port = Number(process.env.CALCBENCH_DIRECT_PORT ?? 8788)) {
    this.port = port;
    this.base = `http://127.0.0.1:${port}`;
  }

  start(): Promise<number> {
    return (this.ready ??= this.boot());
  }

  private async boot(): Promise<number> {
    const t0 = performance.now();
    this.proc = spawnServer("src/http/server.ts", { CALCBENCH_DIRECT_PORT: String(this.port) });
    await waitForStderr(this.proc, "HTTP API ready");
    return performance.now() - t0;   // cold start = spawn + listen (no handshake exists)
  }

  async listTools(): Promise<ToolInfo[]> {
    await this.start();
    const res = await fetch(this.base + "/tools");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    await this.start();
    const res = await fetch(this.base + "/tools/" + name, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(args),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
    return body.result;
  }

  async reset(): Promise<void> {
    await this.callTool("mem_clear", {});
    await this.callTool("tape_clear", {});
  }

  async close(): Promise<void> {
    await stopServer(this.proc);
  }
}
