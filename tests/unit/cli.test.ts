import { test, expect, describe } from "bun:test";
import { parseArgs } from "../../src/cli.ts";
import { Result } from "better-result";

const argv = (...args: string[]) =>
  parseArgs(["/path/to/bun", "/path/to/measure", ...args]);

describe("parseArgs", () => {
  test("no arguments enters REPL mode", () => {
    const result = argv();
    expect(Result.isOk(result)).toBe(true);
    expect(result.unwrap()).toEqual({ command: "repl" });
  });

  test("--help returns help command", () => {
    expect(argv("--help").unwrap()).toEqual({ command: "help" });
    expect(argv("-h").unwrap()).toEqual({ command: "help" });
  });

  test("--version returns version command", () => {
    expect(argv("--version").unwrap()).toEqual({ command: "version" });
    expect(argv("-v").unwrap()).toEqual({ command: "version" });
  });

  test("run captures args", () => {
    const result = argv("run", "npm", "run", "build");
    expect(result.unwrap()).toEqual({
      command: "run",
      args: ["npm", "run", "build"],
    });
  });

  test("run with no args returns error", () => {
    const result = argv("run");
    expect(Result.isError(result)).toBe(true);
  });

  test("bench defaults to 10 iterations", () => {
    const result = argv("bench", "echo", "hello");
    expect(result.unwrap()).toEqual({
      command: "bench",
      iterations: 10,
      warmup: 0,
      args: ["echo", "hello"],
    });
  });

  test("bench -n sets iterations", () => {
    const result = argv("bench", "-n", "5", "echo", "hello");
    expect(result.unwrap()).toEqual({
      command: "bench",
      iterations: 5,
      warmup: 0,
      args: ["echo", "hello"],
    });
  });

  test("bench --warmup sets warmup count", () => {
    const result = argv("bench", "--warmup", "2", "-n", "3", "echo");
    expect(result.unwrap()).toEqual({
      command: "bench",
      iterations: 3,
      warmup: 2,
      args: ["echo"],
    });
  });

  test("bench with no command returns error", () => {
    const result = argv("bench", "-n", "5");
    expect(Result.isError(result)).toBe(true);
  });

  test("history defaults", () => {
    const result = argv("history");
    expect(result.unwrap()).toEqual({
      command: "history",
      limit: 20,
      project: undefined,
      commandFilter: undefined,
    });
  });

  test("history with filters", () => {
    const result = argv(
      "history",
      "--limit",
      "5",
      "--project",
      "my-app",
      "--command",
      "build",
    );
    expect(result.unwrap()).toEqual({
      command: "history",
      limit: 5,
      project: "my-app",
      commandFilter: "build",
    });
  });

  test("stats with filters", () => {
    const result = argv("stats", "--host", "mac-1", "--project", "app");
    expect(result.unwrap()).toEqual({
      command: "stats",
      project: "app",
      commandFilter: undefined,
      host: "mac-1",
    });
  });

  test("export defaults to csv", () => {
    const result = argv("export");
    expect(result.unwrap()).toEqual({
      command: "export",
      format: "csv",
      project: undefined,
      commandFilter: undefined,
      host: undefined,
      output: undefined,
    });
  });

  test("export with all flags", () => {
    const result = argv(
      "export",
      "--format",
      "json",
      "--project",
      "app",
      "-o",
      "out.json",
    );
    expect(result.unwrap()).toEqual({
      command: "export",
      format: "json",
      project: "app",
      commandFilter: undefined,
      host: undefined,
      output: "out.json",
    });
  });

  test("export with invalid format returns error", () => {
    const result = argv("export", "--format", "xml");
    expect(Result.isError(result)).toBe(true);
  });

  test("system command", () => {
    expect(argv("system").unwrap()).toEqual({ command: "system" });
  });

  test("unknown command returns error", () => {
    const result = argv("unknown");
    expect(Result.isError(result)).toBe(true);
  });
});
