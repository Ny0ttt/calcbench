# calcbench

**How does an AI agent call your app's own logic, and what does each way of connecting it cost?**

calcbench puts one small piece of business logic (a calculator) behind three transports and
measures them side by side. The AI client is Claude Code over MCP:

| Route | Transport |
|---|---|
| 1 | **stdio MCP** server, which Claude Code starts as a child process |
| 2 | **HTTP MCP** server |
| 3 | **Direct HTTP API** with no MCP: the "is MCP worth it?" baseline |

A calculator is the subject because its logic is trivial and objectively checkable. That keeps
the plumbing under test separate from any domain complexity.

## The hard part: proving the tool was actually called

A calculator is the one domain a language model can already handle unaided. So a naive test
proves nothing: a correct answer might come from the model, not your code. The tool surface is
built so the model **cannot guess**:

1. **State the model can't see.** A memory register and a running tape live inside the app.
2. **Hidden rules.** `ny0tadd` and `ny0tround` follow rules that **never appear in their tool
   descriptions** (a unit test enforces this). A correct answer is proof the tool was invoked.
3. **Precision models fumble.** Exact decimal division and 200-digit factorials.

The dataset is validated with a **ceiling check**: the same prompts go to the model with tools
disabled. It must score ~0 on the hidden-rule prompts, or the dataset proves nothing.

## Results

Latency is one `ny0tadd` call, 200 samples after a warm-up, **no LLM in the loop**, loopback only.

| Row | Accuracy | p50 | p95 | Cold start | Setup |
|---|---|---|---|---|---|
| floor (in-process call, no AI) | 40/40 | 0.0034 ms | 0.0048 ms | – | none |
| route 1 · stdio MCP | 40/40 | 0.277 ms | 0.590 ms | 284 ms | 1 config entry per AI app |
| route 2 · HTTP MCP | 40/40 | 1.575 ms | 2.440 ms | 450 ms | run a server + 1 URL entry |
| route 3 · direct HTTP | 40/40 | 0.955 ms | 1.526 ms | 161 ms | run a server + custom glue per AI platform |
| ceiling (`claude-opus-5-5`, no tools) | **0/18 hidden-rule** | – | – | – | want 0 |

**What each step costs (p50):**

- **Leaving your own process** (floor → stdio MCP): +0.27 ms
- **A network hop instead of a pipe** (stdio → HTTP MCP): +1.3 ms
- **The MCP layer itself**, both over HTTP (direct HTTP → HTTP MCP): +0.6 ms

All of these are noise next to a single LLM round-trip. Speed is not the real trade-off.
**Setup and tool discovery are.** MCP gives every client standard tool discovery. A plain HTTP
API needs custom glue for each AI platform.

The full table, with p99 and lines of glue code, is in [`bench/results/TABLE.md`](bench/results/TABLE.md).
Machine: AMD Ryzen 5 3550H, Linux, Node 24.

> **Caveat: the hidden rules are now public.** The 0/18 ceiling result was recorded on
> 2026-11-06, before this repo was published. A model trained on, or able to search, this code
> could learn the rules. **If you re-run the benchmark, change the hidden rules in
> `src/calc-core/ops.ts` first**, update the expected answers in `bench/prompts.json`, and re-run
> the ceiling check.

## Design

**One logic, many hosts.** `src/calc-core/` is a pure TypeScript package with zero platform
dependencies. Every route hosts the same core, so the benchmark compares transport only.

```
src/
  calc-core/   pure logic: ops, state (memory + tape), tool manifest
  mcp/         stdio MCP server + HTTP MCP server
  http/        direct HTTP API (no MCP)
  demo/        live web UI driving the same logic
bench/
  adapters/    one adapter per route
  prompts.json the 40-prompt dataset with expected answers
  results/     raw JSON per run + TABLE.md
```

## Run it

Requires **Node 24+**. TypeScript runs directly through Node's type stripping, with no build step.

```bash
npm install
npm test                     # unit + route tests
npm run bench                # all routes, then regenerate TABLE.md
node bench/run.ts mcp-stdio  # a single route: direct | mcp-stdio | mcp-http | http-direct
npm run demo                 # live UI at http://127.0.0.1:8790
```

**With Claude Code:** open Claude Code in the repo root. `.mcp.json` registers the stdio server
(`calcbench`), so you can ask it things like *"what's the ny0t total of 12 and 30?"*

**Ceiling check** (calls the Anthropic API): put `ANTHROPIC_API_KEY=...` in `.env`, then
`npm run bench:ceiling`.

Ports default to 8787 (HTTP MCP), 8788 (direct HTTP) and 8790 (demo). Override them with
`CALCBENCH_HTTP_PORT`, `CALCBENCH_DIRECT_PORT` and `CALCBENCH_DEMO_PORT`.

## License

MIT
