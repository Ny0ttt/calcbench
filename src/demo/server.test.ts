// The live demo's promise: whatever Claude does over MCP, and whatever the page
// does over /api, is pushed to every open page over /events and changes the one
// shared state. Uses port 18790 so it can run while a real demo is up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { McpHttpAdapter } from "../../bench/adapters/mcp-http.ts";

const PORT = 18790;
const BASE = `http://127.0.0.1:${PORT}`;

// Minimal SSE reader: collects named events from /events.
async function openEvents() {
  const res = await fetch(BASE + "/events");
  assert.equal(res.headers.get("content-type"), "text/event-stream");
  const events: { event: string; data: any }[] = [];
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2);
          const ev = /^event: (.+)$/m.exec(block)?.[1];
          const data = /^data: (.+)$/m.exec(block)?.[1];
          if (ev && data) events.push({ event: ev, data: JSON.parse(data) });
        }
      }
    } catch { /* closed */ }
  })();
  const waitFor = async (n: number) => {
    for (let t = 0; t < 100 && events.length < n; t++) await new Promise((r) => setTimeout(r, 20));
    assert.ok(events.length >= n, `expected ${n} events, got ${events.length}`);
  };
  return { events, waitFor, close: () => reader.cancel() };
}

const post = (path: string, body: unknown, ct = "application/json") =>
  fetch(BASE + path, { method: "POST", headers: { "content-type": ct }, body: JSON.stringify(body) });

test("demo: Claude's MCP calls and page presses reach the page live, on one shared state", async () => {
  const claude = new McpHttpAdapter(PORT, "src/demo/server.ts");
  try {
    await claude.start();
    const page = await fetch(BASE + "/");
    assert.equal(page.status, 200);
    assert.match(await page.text(), /calcbench/i);

    const sse = await openEvents();

    // Claude acts over MCP -> page hears it, labelled "claude", with new state.
    assert.equal(String(await claude.callTool("mem_add", { n: 10 })), "10");
    await sse.waitFor(1);
    assert.equal(sse.events[0].event, "activity");
    assert.equal(sse.events[0].data.activity.source, "claude");
    assert.equal(sse.events[0].data.activity.tool, "mem_add");
    assert.equal(sse.events[0].data.state.mem, 10);

    // The page acts over /api -> labelled "page", and Claude sees the same memory.
    const r = await post("/api/tools/mem_add", { n: 5 });
    assert.equal(r.status, 200);
    await sse.waitFor(2);
    assert.equal(sse.events[1].data.activity.source, "page");
    assert.equal(String(await claude.callTool("mem_read", {})), "15");

    // Hidden rule is computed on the server, not in the page.
    assert.equal((await (await post("/api/tools/ny0tadd", { a: 12, b: 30 })).json()).result, 49);

    // Errors are reported, not swallowed.
    assert.equal((await post("/api/tools/divide", { a: 1, b: 0 })).status, 422);

    // State endpoint has history for a page that loads late.
    const st = await (await fetch(BASE + "/api/state")).json();
    assert.equal(st.state.mem, 15);
    assert.ok(st.history.length >= 4);

    // Non-JSON POSTs are refused (blocks other websites pressing the buttons).
    assert.equal((await post("/api/tools/mem_clear", {}, "text/plain")).status, 415);

    // Reset clears everything and tells the page.
    assert.equal((await post("/api/reset", {})).status, 200);
    await sse.waitFor(sse.events.length);
    for (let t = 0; t < 50 && !sse.events.some((e) => e.event === "reset"); t++) await new Promise((r) => setTimeout(r, 20));
    const reset = sse.events.find((e) => e.event === "reset");
    assert.ok(reset, "reset event pushed");
    assert.deepEqual(reset!.data.state, { mem: 0, tape: [] });
    assert.equal(String(await claude.callTool("mem_read", {})), "0");

    await sse.close();
  } finally {
    await claude.close!();
  }
});
