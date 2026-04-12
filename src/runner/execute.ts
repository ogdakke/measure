import { Result } from "better-result";
import { CommandError } from "../errors.ts";
import type { ExecutionResult } from "../types.ts";
import { shellCommand } from "./shell.ts";

export async function executeCommand(
  command: string,
): Promise<Result<ExecutionResult, CommandError>> {
  return Result.tryPromise({
    try: async () => {
      const cmd = shellCommand(command);
      const startNs = Bun.nanoseconds();

      const proc = Bun.spawn(cmd, {
        stdout: "inherit",
        stderr: "inherit",
        stdin: "inherit",
      });

      const exitCode = await proc.exited;
      const durationNs = Bun.nanoseconds() - startNs;
      const usage = proc.resourceUsage();

      return {
        durationNs,
        exitCode,
        cpuUserUs: usage ? Number(usage.cpuTime.user) : null,
        cpuSystemUs: usage ? Number(usage.cpuTime.system) : null,
        maxRss: usage ? Number(usage.maxRSS) : null,
      };
    },
    catch: (e) => new CommandError({ command, message: String(e) }),
  });
}
