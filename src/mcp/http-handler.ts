// Reusable MCP-over-Streamable-HTTP request handler, shared by route 2
// (src/mcp/http-server.ts) and the live demo (src/demo/server.ts), so the two
// cannot drift apart.
//
// One MCP session per client (Mcp-Session-Id header). `makeServer` builds the
// McpServer for each new session; callers pass one that uses a shared store.
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server";
import type { McpServer } from "@modelcontextprotocol/server";

// node:http <-> Web Request/Response bridge
async function toWebRequest(req: IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
    else if (v !== undefined) headers.set(k, v);
  }
  const hasBody = req.method !== "GET" && req.method !== "HEAD" && chunks.length > 0;
  return new Request(`http://${req.headers.host}${req.url}`, {
    method: req.method, headers, body: hasBody ? Buffer.concat(chunks) : undefined,
  });
}

async function sendWebResponse(res: ServerResponse, r: Response): Promise<void> {
  res.statusCode = r.status;
  r.headers.forEach((v, k) => res.setHeader(k, v));
  if (!r.body) { res.end(); return; }
  for await (const chunk of r.body as unknown as AsyncIterable<Uint8Array>) res.write(chunk);
  res.end();
}

function plain(res: ServerResponse, status: number, msg: string) {
  res.writeHead(status, { "content-type": "text/plain" }).end(msg);
}

/** Returns a handler for requests already routed to the MCP endpoint. */
export function createMcpHttpHandler(makeServer: () => McpServer) {
  const sessions = new Map<string, WebStandardStreamableHTTPServerTransport>();

  async function newSession(): Promise<WebStandardStreamableHTTPServerTransport> {
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: true,            // plain JSON replies, no SSE stream needed
      onsessioninitialized: (id) => { sessions.set(id, transport); },
      onsessionclosed: (id) => { sessions.delete(id); },
    });
    await makeServer().connect(transport);
    return transport;
  }

  return async function handleMcp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const sid = req.headers["mcp-session-id"];
    let transport: WebStandardStreamableHTTPServerTransport | undefined;
    if (typeof sid === "string") {
      transport = sessions.get(sid);
      if (!transport) return plain(res, 404, "unknown session");
    } else if (req.method === "POST") {
      transport = await newSession();       // must be an initialize request; SDK enforces it
    } else {
      return plain(res, 400, "missing mcp-session-id");
    }
    await sendWebResponse(res, await transport.handleRequest(await toWebRequest(req)));
  };
}
