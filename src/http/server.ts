// Calcbench direct HTTP API (route 3) — NO MCP. The "is MCP worth it" baseline:
// the kind of endpoint you'd hand-write in Express or Laravel.
//
//   GET  /tools              -> [{ name, description }]
//   POST /tools/:name {args} -> { result: "<text>" }   errors -> 4xx { error }
//
// Same manifest, same calc-core, same normalize() as the MCP servers.
// 127.0.0.1 only, Host header checked.
import { createServer } from "node:http";
import type { ServerResponse } from "node:http";
import { tools, toolByName, InMemoryStore, normalize } from "../calc-core/index.ts";

const PORT = Number(process.env.CALCBENCH_DIRECT_PORT ?? 8788);
const HOST = "127.0.0.1";
const ALLOWED_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
const store = new InMemoryStore();

function json(res: ServerResponse, status: number, body: unknown) {
  const s = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(s) }).end(s);
}

const http = createServer(async (req, res) => {
  try {
    if (!ALLOWED_HOSTS.has(req.headers.host ?? "")) return json(res, 403, { error: "forbidden host" });
    const url = req.url ?? "";

    if (req.method === "GET" && url === "/tools") {
      return json(res, 200, tools.map((t) => ({ name: t.name, description: t.description })));
    }

    const m = /^\/tools\/([a-z0-9_]+)$/.exec(url);
    if (req.method === "POST" && m) {
      const tool = toolByName[m[1]];
      if (!tool) return json(res, 404, { error: "unknown tool: " + m[1] });
      let raw = "";
      for await (const c of req) raw += c;
      let args: unknown;
      try { args = raw ? JSON.parse(raw) : {}; } catch { return json(res, 400, { error: "body is not JSON" }); }
      if (typeof args !== "object" || args === null || Array.isArray(args)) {
        return json(res, 400, { error: "body must be a JSON object" });
      }
      try {
        const result = await tool.handler(args as Record<string, unknown>, { store });
        return json(res, 200, { result: normalize(result) });
      } catch (e) {
        return json(res, 422, { error: e instanceof Error ? e.message : String(e) });
      }
    }
    return json(res, 404, { error: "not found" });
  } catch (e) {
    process.stderr.write("[calcbench-direct] " + (e instanceof Error ? e.stack : String(e)) + "\n");
    if (!res.headersSent) json(res, 500, { error: "internal error" }); else res.end();
  }
});

http.on("error", (e: NodeJS.ErrnoException) => {
  process.stderr.write(e.code === "EADDRINUSE"
    ? `[calcbench-direct] port ${PORT} is in use — set CALCBENCH_DIRECT_PORT to another port\n`
    : `[calcbench-direct] ${e.message}\n`);
  process.exit(1);
});

http.listen(PORT, HOST, () => {
  process.stderr.write(`[calcbench-direct] HTTP API ready on http://${HOST}:${PORT} (${tools.length} tools)\n`);
});
