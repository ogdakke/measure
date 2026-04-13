import { Result } from "better-result";
import { CommandError } from "../errors.ts";
import type { ExecutionResult } from "../types.ts";
import { buildCommand, shellCommand, shouldUseShellForArgs } from "./shell.ts";

function createExecutionResult(
  proc: ReturnType<typeof Bun.spawn>,
  startNs: number,
  exitCode: number,
): ExecutionResult {
  const durationNs = Bun.nanoseconds() - startNs;
  const usage = proc.resourceUsage();

  return {
    durationNs,
    exitCode,
    cpuUserUs: usage ? Number(usage.cpuTime.user) : null,
    cpuSystemUs: usage ? Number(usage.cpuTime.system) : null,
    maxRss: usage ? Number(usage.maxRSS) : null,
  };
}

async function executeSpawnedCommand(
  cmd: string[],
  displayCommand: string,
): Promise<Result<ExecutionResult, CommandError>> {
  return Result.tryPromise({
    try: async () => {
      const startNs = Bun.nanoseconds();
      const proc = Bun.spawn(cmd, {
        stdout: "inherit",
        stderr: "inherit",
        stdin: "inherit",
      });

      const exitCode = await proc.exited;
      return createExecutionResult(proc, startNs, exitCode);
    },
    catch: (e) => new CommandError({ command: displayCommand, message: String(e) }),
  });
}

export async function executeCommand(
  command: string,
  displayCommand = command,
): Promise<Result<ExecutionResult, CommandError>> {
  return executeSpawnedCommand(shellCommand(command), displayCommand);
}

export async function executeArgs(args: string[]): Promise<Result<ExecutionResult, CommandError>> {
  const displayCommand = args.join(" ");
  if (shouldUseShellForArgs(args)) {
    const shellSnippet = args.length === 1 ? args[0]! : buildCommand(args);
    return executeCommand(shellSnippet, displayCommand);
  }

  return executeSpawnedCommand(args, displayCommand);
}
