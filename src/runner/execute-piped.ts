import type { Subprocess } from "bun";
import { platform } from "node:os";
import { shellCommand } from "./shell.ts";
import type { ExecutionResult } from "../types.ts";

export interface PipedExecution {
  proc: Subprocess<"pipe", "pipe", "pipe">;
  startNs: number;
}

/** Spawn a command with piped stdout/stderr for use in the REPL (where Ink owns the terminal). */
export function spawnPiped(command: string): PipedExecution {
  const cmd = shellCommand(command);
  const startNs = Bun.nanoseconds();
  const proc = Bun.spawn(cmd, {
    stdout: "pipe",
    stderr: "pipe",
    stdin: "pipe",
    detached: platform() !== "win32",
  });
  return { proc, startNs };
}

/** Cancel a piped process without tearing down the surrounding REPL. */
export function cancelPipedExecution(
  execution: PipedExecution,
  signal: NodeJS.Signals = "SIGTERM",
) {
  if (execution.proc.killed) {
    return;
  }

  if (platform() !== "win32") {
    try {
      process.kill(-execution.proc.pid, signal);
      return;
    } catch {
      // Fall back to the direct child kill below if process-group signaling fails.
    }
  }

  execution.proc.kill(signal);
}

/** Collect the execution result after a piped process exits. */
export function collectResult(execution: PipedExecution, exitCode: number): ExecutionResult {
  const durationNs = Bun.nanoseconds() - execution.startNs;
  const usage = execution.proc.resourceUsage();
  return {
    durationNs,
    exitCode,
    cpuUserUs: usage ? Number(usage.cpuTime.user) : null,
    cpuSystemUs: usage ? Number(usage.cpuTime.system) : null,
    maxRss: usage ? Number(usage.maxRSS) : null,
  };
}
