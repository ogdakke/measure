import { test, expect, describe } from "bun:test";
import { cancelPipedExecution, spawnPiped } from "../../src/runner/execute-piped.ts";
import { shellCommand, buildCommand, quoteArg } from "../../src/runner/shell.ts";

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

describe("quoteArg", () => {
  describe("unix", () => {
    test("leaves simple args unquoted", () => {
      expect(quoteArg("hello", "linux")).toBe("hello");
      expect(quoteArg("foo-bar", "linux")).toBe("foo-bar");
      expect(quoteArg("path/to/file", "linux")).toBe("path/to/file");
    });

    test("quotes args with spaces", () => {
      expect(quoteArg("foo bar", "linux")).toBe("'foo bar'");
    });

    test("quotes args with double quotes", () => {
      expect(quoteArg('say "hi"', "linux")).toBe("'say \"hi\"'");
    });

    test("escapes single quotes inside args", () => {
      expect(quoteArg("it's", "linux")).toBe("'it'\\''s'");
    });

    test("quotes args with shell metacharacters", () => {
      expect(quoteArg("a&b", "linux")).toBe("'a&b'");
      expect(quoteArg("a|b", "linux")).toBe("'a|b'");
      expect(quoteArg("$HOME", "linux")).toBe("'$HOME'");
    });
  });

  describe("win32", () => {
    test("leaves simple args unquoted", () => {
      expect(quoteArg("hello", "win32")).toBe("hello");
      expect(quoteArg("foo-bar", "win32")).toBe("foo-bar");
    });

    test("quotes args with spaces", () => {
      expect(quoteArg("foo bar", "win32")).toBe('"foo bar"');
    });

    test("doubles inner quotes", () => {
      expect(quoteArg('say "hi"', "win32")).toBe('"say ""hi"""');
    });

    test("quotes args with cmd metacharacters", () => {
      expect(quoteArg("a&b", "win32")).toBe('"a&b"');
      expect(quoteArg("a|b", "win32")).toBe('"a|b"');
    });
  });
});

describe("buildCommand", () => {
  test("joins simple args with spaces", () => {
    // buildCommand uses platform(), so on linux this tests unix quoting
    const result = buildCommand(["echo", "hello"]);
    expect(result).toBe("echo hello");
  });

  test("re-quotes args containing spaces", () => {
    const result = buildCommand(["git", "commit", "-m", "foo bar"]);
    expect(result).toBe("git commit -m 'foo bar'");
  });

  test("handles args with special characters", () => {
    const result = buildCommand(["echo", "hello world", "it's"]);
    expect(result).toBe("echo 'hello world' 'it'\\''s'");
  });
});
