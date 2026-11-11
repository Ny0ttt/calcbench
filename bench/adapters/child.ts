// Starts a server script as a child process for an adapter, and makes sure it
// dies with the harness (normal exit, Ctrl-C, or crash) — no orphaned servers
// left holding ports.
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = join(here, "..", "..");

const live = new Set<ChildProcess>();
function killAll() { for (const p of live) p.kill(); live.clear(); }
process.on("exit", killAll);
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => { killAll(); process.exit(130); });
}

export function spawnServer(
  relScript: string, env: Record<string, string> = {}, stdout: "pipe" | "ignore" = "ignore",
): ChildProcess {
  const proc = spawn("node", [join(repoRoot, relScript)], {
    stdio: ["pipe", stdout, "pipe"],
    env: { ...process.env, ...env },
  });
  live.add(proc);
  proc.on("exit", () => live.delete(proc));
  return proc;
}

// Resolves when the child prints `marker` on stderr; rejects if it exits first
// or takes longer than timeoutMs. Other stderr lines are passed through.
export function waitForStderr(proc: ChildProcess, marker: string, timeoutMs = 10_000): Promise<void> {
  return new Promise((resolve, reject) => {
    let buf = "";
    let done = false;
    const finish = (err?: Error) => { if (done) return; done = true; clearTimeout(t); err ? reject(err) : resolve(); };
    const t = setTimeout(() => finish(new Error("server did not start within " + timeoutMs + "ms")), timeoutMs);
    proc.stderr!.on("data", (c: Buffer) => {
      const s = c.toString();
      if (!done) { buf += s; if (buf.includes(marker)) finish(); }
      if (!s.includes(marker)) process.stderr.write(s);    // surface real errors
    });
    proc.on("exit", (code) => finish(new Error("server exited early (code " + code + ")")));
  });
}

export async function stopServer(proc: ChildProcess | undefined): Promise<void> {
  if (!proc || proc.exitCode !== null) return;
  await new Promise<void>((resolve) => { proc.once("exit", () => resolve()); proc.kill(); });
}
