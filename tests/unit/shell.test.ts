import { test, expect, describe } from "bun:test";
import { cancelPipedExecution, spawnPiped } from "../../src/runner/execute-piped.ts";
import { shellCommand } from "../../src/runner/shell.ts";

describe("shellCommand", () => {
  test("returns sh -c on non-win32 platform", () => {
    // We're running on macOS/Linux so this should be sh -c
    const result = shellCommand("echo hello");
    expect(result).toEqual(["sh", "-c", "echo hello"]);
  });

  test("preserves command string exactly", () => {
    const cmd = 'npm run build && echo "done"';
    const result = shellCommand(cmd);
    expect(result[2]).toBe(cmd);
  });

  test("can cancel a long-running piped command", async () => {
    const execution = spawnPiped('bun -e "setInterval(() => {}, 1000)"');

    await Bun.sleep(100);
    cancelPipedExecution(execution);

    const timeout = Symbol("timeout");
    const exitCode = await Promise.race([
      execution.proc.exited,
      Bun.sleep(2_000).then(() => timeout),
    ]);

    expect(exitCode).not.toBe(timeout);
    expect(typeof exitCode).toBe("number");
  });
});
