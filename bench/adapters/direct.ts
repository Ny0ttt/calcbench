// The CONTROL / FLOOR adapter: calls calc-core directly, no AI, no transport.
// Establishes the irreducible cost of the logic itself, and is used to VALIDATE
// the dataset (do the ground-truth calls actually produce the expected answers).
import { toolByName, InMemoryStore } from "../../src/calc-core/index.ts";
import type { Store } from "../../src/calc-core/index.ts";
import type { RouteAdapter, ToolInfo } from "../types.ts";

export class DirectAdapter implements RouteAdapter {
  readonly name = "direct";
  private store: Store = new InMemoryStore();

  async listTools(): Promise<ToolInfo[]> {
    return Object.values(toolByName).map((t) => ({ name: t.name, description: t.description }));
  }
  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const tool = toolByName[name];
    if (!tool) throw new Error("unknown tool: " + name);
    return tool.handler(args, { store: this.store });
  }
  async reset(): Promise<void> { this.store = new InMemoryStore(); }
}
