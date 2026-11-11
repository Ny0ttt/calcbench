// Calcbench headless stdio MCP server (route 1). A THIN shell over calc-core:
// tool registration lives in register.ts (shared with the HTTP server).
//
// stdout carries the JSON-RPC protocol stream — NEVER write to it. Any logging
// goes to stderr.
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { tools, InMemoryStore } from "../calc-core/index.ts";
import { buildServer } from "./register.ts";

const server = buildServer(new InMemoryStore());   // one persistent session state
await server.connect(new StdioServerTransport());
process.stderr.write("[calcbench] MCP server ready on stdio (" + tools.length + " tools)\n");
