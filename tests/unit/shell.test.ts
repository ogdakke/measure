import { test, expect, describe } from "bun:test";
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
});
