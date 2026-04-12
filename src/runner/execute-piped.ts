import type { Subprocess } from "bun";
import { shellCommand } from "./shell.ts";
import type { ExecutionResult } from "../types.ts";

export interface PipedExecution {
  proc: Subprocess;
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
  });
  return { proc, startNs };
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
