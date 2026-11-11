// ROUTE 2: MCP over Streamable HTTP. Starts src/mcp/http-server.ts, then
// speaks raw JSON-RPC via fetch() — same protocol messages as route 1, only
// the transport differs. Node's fetch keeps the connection alive between
// calls, so per-call latency is the protocol, not TCP setup.
import type { ChildProcess } from "node:child_process";
import { spawnServer, waitForStderr, stopServer } from "./child.ts";
import { PROTOCOL_VERSION } from "./mcp-stdio.ts";
import type { RouteAdapter, ToolInfo } from "../types.ts";

export class McpHttpAdapter implements RouteAdapter {
  readonly name = "mcp-http";
  private proc?: ChildProcess;
  private ready?: Promise<number>;
  private url: string;
  private sessionId?: string;
  private protocolVersion = PROTOCOL_VERSION;
  private nextId = 0;

  private port: number;

  private script: string;

  // `script` lets the demo server (same /mcp endpoint) be tested with this adapter.
  constructor(port = Number(process.env.CALCBENCH_HTTP_PORT ?? 8787), script = "src/mcp/http-server.ts") {
    this.script = script;
    this.port = port;
    this.url = `http://127.0.0.1:${port}/mcp`;
  }

  start(): Promise<number> {
    return (this.ready ??= this.boot());
  }

  private async boot(): Promise<number> {
    const t0 = performance.now();
    this.proc = spawnServer(this.script, { CALCBENCH_HTTP_PORT: String(this.port), CALCBENCH_DEMO_PORT: String(this.port) });
    await waitForStderr(this.proc, "MCP server ready");
    const init = await this.post({
      jsonrpc: "2.0", id: ++this.nextId, method: "initialize",
      params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "calcbench-bench", version: "0.0.0" } },
    });
    if (!init?.result?.serverInfo) throw new Error("bad initialize result: " + JSON.stringify(init));
    this.protocolVersion = init.result.protocolVersion ?? PROTOCOL_VERSION;
    await this.post({ jsonrpc: "2.0", method: "notifications/initialized" });
    return performance.now() - t0;   // cold start = spawn + listen + handshake
  }

  // One JSON-RPC message per POST. Returns the reply (or undefined for a 202
  // notification ack). Accepts either a JSON body or an SSE stream.
  private async post(msg: Record<string, unknown>): Promise<any> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "accept": "application/json, text/event-stream",
    };
    if (this.sessionId) {
      headers["mcp-session-id"] = this.sessionId;
      headers["mcp-protocol-version"] = this.protocolVersion;
    }
    const res = await fetch(this.url, { method: "POST", headers, body: JSON.stringify(msg) });
    const sid = res.headers.get("mcp-session-id");
    if (sid) this.sessionId = sid;
    if (res.status === 202) { await res.body?.cancel(); return undefined; }
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    if ((res.headers.get("content-type") ?? "").includes("text/event-stream")) {
      for (const line of text.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const m = JSON.parse(line.slice(5));
        if (m.id === msg.id) return m;
      }
      throw new Error("no reply for id " + msg.id + " in SSE stream");
    }
    return JSON.parse(text);
  }

  private async request(method: string, params?: unknown): Promise<any> {
    await this.start();
    const r = await this.post({ jsonrpc: "2.0", id: ++this.nextId, method, params });
    if (r.error) throw new Error("JSON-RPC " + r.error.code + ": " + r.error.message);
    return r.result;
  }

  async listTools(): Promise<ToolInfo[]> {
    const r = await this.request("tools/list", {});
    return r.tools.map((t: any) => ({ name: t.name, description: t.description }));
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const r = await this.request("tools/call", { name, arguments: args });
    const text = r.content?.[0]?.text;
    if (r.isError) throw new Error(text ?? "tool error");
    return text;
  }

  async reset(): Promise<void> {
    await this.callTool("mem_clear", {});
    await this.callTool("tape_clear", {});
  }

  async close(): Promise<void> {
    if (this.sessionId) {
      try {
        await fetch(this.url, { method: "DELETE", headers: { "mcp-session-id": this.sessionId, "mcp-protocol-version": this.protocolVersion } });
      } catch { /* server may already be gone */ }
    }
    await stopServer(this.proc);
  }
}
