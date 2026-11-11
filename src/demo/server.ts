// Calcbench LIVE DEMO server. One process, one store, three doors:
//
//   /mcp               Claude (MCP over Streamable HTTP, same tools as route 2)
//   /api/tools/:name   the page's buttons (same handlers Claude uses)
//   /events            live push to the page (Server-Sent Events)
//   /                  the page itself
//   /api/state         current memory + tape + recent activity (on page load)
//   /api/reset         clear memory, tape and activity (clean demo start)
//
// Every tool call — from Claude or the page — is broadcast to every open page,
// so the page shows Claude's actions as they happen.
//
//   npm run demo      -> http://127.0.0.1:8790
//
// 127.0.0.1 only + Host header check (blocks DNS rebinding). /api POSTs require
// Content-Type: application/json, which makes browsers send a CORS preflight
// that this server never approves — so other websites can't press the buttons.
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tools, toolByName, InMemoryStore } from "../calc-core/index.ts";
import { buildServer } from "../mcp/register.ts";
import { createMcpHttpHandler } from "../mcp/http-handler.ts";

const PORT = Number(process.env.CALCBENCH_DEMO_PORT ?? 8790);
const HOST = "127.0.0.1";
const ALLOWED_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
const PAGE = join(dirname(fileURLToPath(import.meta.url)), "public", "index.html");
const HISTORY = 50;

type Source = "claude" | "page";
interface State { mem: number; tape: number[] }
interface Activity { id: number; at: number; source: Source; tool: string; args: Record<string, unknown>; result?: unknown; error?: string }

const store = new InMemoryStore();
const history: Activity[] = [];
const pages = new Set<ServerResponse>();
let nextId = 0;

async function snapshot(): Promise<State> {
  const ctx = { store };
  return {
    mem: Number(await toolByName.mem_read.handler({}, ctx)),
    tape: (await toolByName.tape_list.handler({}, ctx)) as number[],
  };
}

function push(event: string, data: unknown) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const p of pages) p.write(msg);
}

async function record(source: Source, call: { tool: string; args: Record<string, unknown>; result?: unknown; error?: string }) {
  const a: Activity = { id: ++nextId, at: Date.now(), source, ...call };
  history.push(a);
  if (history.length > HISTORY) history.shift();
  push("activity", { activity: a, state: await snapshot() });
}

const handleMcp = createMcpHttpHandler(() => buildServer(store, (call) => record("claude", call)));

function json(res: ServerResponse, status: number, body: unknown) {
  const s = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(s) }).end(s);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let raw = "";
  for await (const c of req) raw += c;
  return raw ? JSON.parse(raw) : {};
}

const http = createServer(async (req, res) => {
  try {
    if (!ALLOWED_HOSTS.has(req.headers.host ?? "")) return json(res, 403, { error: "forbidden host" });
    const url = (req.url ?? "/").split("?")[0];

    if (url.startsWith("/mcp")) return await handleMcp(req, res);

    if (req.method === "GET" && url === "/") {
      // Read on each request so page edits show on refresh without a restart.
      return void res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }).end(readFileSync(PAGE));
    }

    if (req.method === "GET" && url === "/events") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
      res.write(": connected\n\n");
      pages.add(res);
      const ping = setInterval(() => res.write(": ping\n\n"), 15_000);
      req.on("close", () => { clearInterval(ping); pages.delete(res); });
      return;
    }

    if (req.method === "GET" && url === "/api/state") {
      return json(res, 200, { state: await snapshot(), history });
    }

    if (req.method === "POST" && url.startsWith("/api/")) {
      if (!(req.headers["content-type"] ?? "").startsWith("application/json")) {
        return json(res, 415, { error: "Content-Type must be application/json" });
      }
      if (url === "/api/reset") {
        await toolByName.mem_clear.handler({}, { store });
        await toolByName.tape_clear.handler({}, { store });
        history.length = 0;
        push("reset", { state: await snapshot() });
        return json(res, 200, { ok: true });
      }
      const m = /^\/api\/tools\/([a-z0-9_]+)$/.exec(url);
      if (m) {
        const tool = toolByName[m[1]];
        if (!tool) return json(res, 404, { error: "unknown tool: " + m[1] });
        let args: unknown;
        try { args = await readJson(req); } catch { return json(res, 400, { error: "body is not JSON" }); }
        if (typeof args !== "object" || args === null || Array.isArray(args)) return json(res, 400, { error: "body must be a JSON object" });
        const a = args as Record<string, unknown>;
        try {
          const result = await tool.handler(a, { store });
          await record("page", { tool: tool.name, args: a, result });
          return json(res, 200, { result });
        } catch (e) {
          const error = e instanceof Error ? e.message : String(e);
          await record("page", { tool: tool.name, args: a, error });
          return json(res, 422, { error });
        }
      }
    }
    return json(res, 404, { error: "not found" });
  } catch (e) {
    process.stderr.write("[calcbench-demo] " + (e instanceof Error ? e.stack : String(e)) + "\n");
    if (!res.headersSent) json(res, 500, { error: "internal error" }); else res.end();
  }
});

http.on("error", (e: NodeJS.ErrnoException) => {
  process.stderr.write(e.code === "EADDRINUSE"
    ? `[calcbench-demo] port ${PORT} is in use — set CALCBENCH_DEMO_PORT to another port\n`
    : `[calcbench-demo] ${e.message}\n`);
  process.exit(1);
});

http.listen(PORT, HOST, () => {
  // "MCP server ready" is the marker the test/bench helpers wait for.
  process.stderr.write(
    `[calcbench-demo] MCP server ready on http://${HOST}:${PORT}/mcp (${tools.length} tools)\n` +
    `[calcbench-demo] open the page:  http://${HOST}:${PORT}\n`);
});
