import { test, expect, describe, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { migrate } from "../../src/db/schema.ts";
import { insertMeasurement } from "../../src/db/queries.ts";
import { exportCommand } from "../../src/commands/export.ts";
import { Result } from "better-result";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { SystemInfo, ExecutionResult } from "../../src/types.ts";

const mockSystem: SystemInfo = {
  os: "darwin",
  cpuModel: "Apple M1 Pro",
  cpuCores: 8,
  ramBytes: 17179869184,
  hostname: "test-mac",
  username: "tester",
  shell: "/bin/zsh",
  bunVersion: "1.3.12",
};

const mockExecution: ExecutionResult = {
  durationNs: 5_000_000,
  exitCode: 0,
  cpuUserUs: 2000,
  cpuSystemUs: 1000,
  maxRss: 1024 * 1024,
};

let db: Database;

beforeEach(() => {
  db = new Database(":memory:", { strict: true });
  migrate(db);
});

describe("exportCommand", () => {
  test("exports JSON to file", () => {
    insertMeasurement(db, {
      command: "echo test",
      project: "app",
      execution: mockExecution,
      system: mockSystem,
      cwd: "/tmp",
      benchGroup: null,
    });

    const tmpDir = mkdtempSync(join(tmpdir(), "measure-test-"));
    const outPath = join(tmpDir, "export.json");

    const result = exportCommand(db, "json", undefined, undefined, undefined, outPath);
    expect(Result.isOk(result)).toBe(true);

    const content = JSON.parse(
      require("node:fs").readFileSync(outPath, "utf-8"),
    );
    expect(content.length).toBe(1);
    expect(content[0].command).toBe("echo test");
    expect(content[0].project).toBe("app");
  });

  test("exports CSV to file", () => {
    insertMeasurement(db, {
      command: "echo csv",
      project: null,
      execution: mockExecution,
      system: mockSystem,
      cwd: "/tmp",
      benchGroup: null,
    });

    const tmpDir = mkdtempSync(join(tmpdir(), "measure-test-"));
    const outPath = join(tmpDir, "export.csv");

    const result = exportCommand(db, "csv", undefined, undefined, undefined, outPath);
    expect(Result.isOk(result)).toBe(true);

    const content = require("node:fs").readFileSync(outPath, "utf-8") as string;
    const lines = content.trim().split("\n");
    expect(lines.length).toBe(2); // header + 1 row
    expect(lines[0]).toContain("command");
    expect(lines[1]).toContain("echo csv");
  });
});
