// Calcbench MCP server over Streamable HTTP (route 2). Same tools as the stdio
// server (both use register.ts); only the transport differs.
//
//   POST/GET/DELETE http://127.0.0.1:8787/mcp
//
// One MCP session per client (Mcp-Session-Id header). All sessions share ONE
// store, same as the stdio server's single session.
//
// Listens on 127.0.0.1 only and checks the Host header, so a web page in your
// browser can't reach it by DNS rebinding. Not hardened for the open internet.
import { createServer } from "node:http";
import { tools, InMemoryStore } from "../calc-core/index.ts";
import { buildServer } from "./register.ts";
import { createMcpHttpHandler } from "./http-handler.ts";

const PORT = Number(process.env.CALCBENCH_HTTP_PORT ?? 8787);
const HOST = "127.0.0.1";
const ALLOWED_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);

const store = new InMemoryStore();
const handleMcp = createMcpHttpHandler(() => buildServer(store));

const http = createServer(async (req, res) => {
  try {
    if (!ALLOWED_HOSTS.has(req.headers.host ?? "")) return void res.writeHead(403).end("forbidden host");
    if (!req.url?.startsWith("/mcp")) return void res.writeHead(404).end("not found");
    await handleMcp(req, res);
  } catch (e) {
    process.stderr.write("[calcbench-http] " + (e instanceof Error ? e.stack : String(e)) + "\n");
    if (!res.headersSent) res.writeHead(500).end("internal error"); else res.end();
  }
});

http.on("error", (e: NodeJS.ErrnoException) => {
  process.stderr.write(e.code === "EADDRINUSE"
    ? `[calcbench-http] port ${PORT} is in use — set CALCBENCH_HTTP_PORT to another port\n`
    : `[calcbench-http] ${e.message}\n`);
  process.exit(1);
});

http.listen(PORT, HOST, () => {
  // The adapter waits for this exact line on stderr before sending requests.
  process.stderr.write(`[calcbench-http] MCP server ready on http://${HOST}:${PORT}/mcp (${tools.length} tools)\n`);
});
