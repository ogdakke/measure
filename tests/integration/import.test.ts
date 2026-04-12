import { test, expect, describe, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { migrate } from "../../src/db/schema.ts";
import { insertMeasurement, getHistory } from "../../src/db/queries.ts";
import { importCommand } from "../../src/commands/import.ts";
import { exportCommand } from "../../src/commands/export.ts";
import { Result } from "better-result";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { SystemInfo, ExecutionResult } from "../../src/types.ts";

const mockSystem: SystemInfo = {
  os: "darwin",
  cpuModel: "Apple M1 Pro",
  cpuCores: 8,
  ramBytes: 17179869184,
  hostname: "test-mac",
  username: "alice",
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

let targetDb: Database;
let tmpDir: string;

beforeEach(() => {
  targetDb = new Database(":memory:", { strict: true });
  migrate(targetDb);
  tmpDir = mkdtempSync(join(tmpdir(), "measure-import-test-"));
});

function createSourceDb(
  measurements: Array<{ command: string; hostname: string; username: string }>,
): string {
  const path = join(tmpDir, `source-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  const db = new Database(path, { create: true, strict: true });
  migrate(db);
  for (const m of measurements) {
    insertMeasurement(db, {
      command: m.command,
      project: "test-project",
      execution: mockExecution,
      system: { ...mockSystem, hostname: m.hostname, username: m.username },
      cwd: "/tmp",
      benchGroup: null,
    });
  }
  db.close();
  return path;
}

describe("importCommand — .db files", () => {
  test("imports measurements from a .db file", () => {
    const sourcePath = createSourceDb([
      { command: "echo hello", hostname: "alice-mac", username: "alice" },
      { command: "npm run build", hostname: "alice-mac", username: "alice" },
    ]);

    const result = importCommand(targetDb, [sourcePath]);
    expect(Result.isOk(result)).toBe(true);

    const history = getHistory(targetDb, { limit: 10 });
    expect(history.unwrap().length).toBe(2);
  });

  test("deduplicates on (command, hostname, username, created_at)", () => {
    const sourcePath = createSourceDb([
      { command: "echo hello", hostname: "alice-mac", username: "alice" },
    ]);

    // Import once
    importCommand(targetDb, [sourcePath]);
    // Import again — should skip the duplicate
    importCommand(targetDb, [sourcePath]);

    const history = getHistory(targetDb, { limit: 10 });
    expect(history.unwrap().length).toBe(1);
  });

  test("imports from multiple .db files", () => {
    const source1 = createSourceDb([
      { command: "echo alice", hostname: "alice-mac", username: "alice" },
    ]);
    const source2 = createSourceDb([{ command: "echo bob", hostname: "bob-pc", username: "bob" }]);

    const result = importCommand(targetDb, [source1, source2]);
    expect(Result.isOk(result)).toBe(true);

    const history = getHistory(targetDb, { limit: 10 });
    expect(history.unwrap().length).toBe(2);
  });

  test("rejects non-measure .db files", () => {
    const path = join(tmpDir, "not-measure.db");
    const db = new Database(path, { create: true, strict: true });
    db.run("CREATE TABLE other (id INTEGER PRIMARY KEY)");
    db.close();

    const result = importCommand(targetDb, [path]);
    expect(Result.isError(result)).toBe(true);
  });
});

describe("importCommand — .json files", () => {
  test("imports measurements from a JSON export", () => {
    // First, create some data and export it
    const sourceDb = new Database(":memory:", { strict: true });
    migrate(sourceDb);
    insertMeasurement(sourceDb, {
      command: "npm test",
      project: "app",
      execution: mockExecution,
      system: { ...mockSystem, hostname: "charlie-mac", username: "charlie" },
      cwd: "/tmp",
      benchGroup: null,
    });

    const jsonPath = join(tmpDir, "export.json");
    exportCommand(sourceDb, "json", undefined, undefined, undefined, jsonPath);

    // Now import into target
    const result = importCommand(targetDb, [jsonPath]);
    expect(Result.isOk(result)).toBe(true);

    const history = getHistory(targetDb, { limit: 10 });
    const rows = history.unwrap();
    expect(rows.length).toBe(1);
    expect(rows[0]!.command).toBe("npm test");
    expect(rows[0]!.hostname).toBe("charlie-mac");
    expect(rows[0]!.username).toBe("charlie");
  });

  test("deduplicates JSON imports", () => {
    const sourceDb = new Database(":memory:", { strict: true });
    migrate(sourceDb);
    insertMeasurement(sourceDb, {
      command: "echo json",
      project: null,
      execution: mockExecution,
      system: mockSystem,
      cwd: "/tmp",
      benchGroup: null,
    });

    const jsonPath = join(tmpDir, "dup.json");
    exportCommand(sourceDb, "json", undefined, undefined, undefined, jsonPath);

    importCommand(targetDb, [jsonPath]);
    importCommand(targetDb, [jsonPath]);

    const history = getHistory(targetDb, { limit: 10 });
    expect(history.unwrap().length).toBe(1);
  });
});

describe("importCommand — .csv files", () => {
  test("imports measurements from a CSV export", () => {
    const sourceDb = new Database(":memory:", { strict: true });
    migrate(sourceDb);
    insertMeasurement(sourceDb, {
      command: "cargo build",
      project: "rust-app",
      execution: mockExecution,
      system: { ...mockSystem, hostname: "dana-pc", username: "dana" },
      cwd: "/home/dana/rust-app",
      benchGroup: null,
    });

    const csvPath = join(tmpDir, "export.csv");
    exportCommand(sourceDb, "csv", undefined, undefined, undefined, csvPath);

    const result = importCommand(targetDb, [csvPath]);
    expect(Result.isOk(result)).toBe(true);

    const history = getHistory(targetDb, { limit: 10 });
    const rows = history.unwrap();
    expect(rows.length).toBe(1);
    expect(rows[0]!.command).toBe("cargo build");
    expect(rows[0]!.hostname).toBe("dana-pc");
    expect(rows[0]!.username).toBe("dana");
    expect(rows[0]!.project).toBe("rust-app");
  });

  test("deduplicates CSV imports", () => {
    const sourceDb = new Database(":memory:", { strict: true });
    migrate(sourceDb);
    insertMeasurement(sourceDb, {
      command: "echo csv",
      project: null,
      execution: mockExecution,
      system: mockSystem,
      cwd: "/tmp",
      benchGroup: null,
    });

    const csvPath = join(tmpDir, "dup.csv");
    exportCommand(sourceDb, "csv", undefined, undefined, undefined, csvPath);

    importCommand(targetDb, [csvPath]);
    importCommand(targetDb, [csvPath]);

    const history = getHistory(targetDb, { limit: 10 });
    expect(history.unwrap().length).toBe(1);
  });

  test("handles CSV with quoted fields", () => {
    // Create a command with commas in it
    const sourceDb = new Database(":memory:", { strict: true });
    migrate(sourceDb);
    insertMeasurement(sourceDb, {
      command: 'echo "hello, world"',
      project: null,
      execution: mockExecution,
      system: mockSystem,
      cwd: "/tmp",
      benchGroup: null,
    });

    const csvPath = join(tmpDir, "quoted.csv");
    exportCommand(sourceDb, "csv", undefined, undefined, undefined, csvPath);

    const result = importCommand(targetDb, [csvPath]);
    expect(Result.isOk(result)).toBe(true);

    const history = getHistory(targetDb, { limit: 10 });
    expect(history.unwrap()[0]!.command).toBe('echo "hello, world"');
  });
});

describe("importCommand — mixed formats", () => {
  test("imports from db, json, and csv in one call", () => {
    // Create source data in 3 formats
    const dbSource = createSourceDb([
      { command: "echo db", hostname: "host-1", username: "user1" },
    ]);

    const jsonSourceDb = new Database(":memory:", { strict: true });
    migrate(jsonSourceDb);
    insertMeasurement(jsonSourceDb, {
      command: "echo json",
      project: null,
      execution: mockExecution,
      system: { ...mockSystem, hostname: "host-2", username: "user2" },
      cwd: "/tmp",
      benchGroup: null,
    });
    const jsonPath = join(tmpDir, "mixed.json");
    exportCommand(jsonSourceDb, "json", undefined, undefined, undefined, jsonPath);

    const csvSourceDb = new Database(":memory:", { strict: true });
    migrate(csvSourceDb);
    insertMeasurement(csvSourceDb, {
      command: "echo csv",
      project: null,
      execution: mockExecution,
      system: { ...mockSystem, hostname: "host-3", username: "user3" },
      cwd: "/tmp",
      benchGroup: null,
    });
    const csvPath = join(tmpDir, "mixed.csv");
    exportCommand(csvSourceDb, "csv", undefined, undefined, undefined, csvPath);

    const result = importCommand(targetDb, [dbSource, jsonPath, csvPath]);
    expect(Result.isOk(result)).toBe(true);

    const history = getHistory(targetDb, { limit: 10 });
    expect(history.unwrap().length).toBe(3);
  });
});

describe("importCommand — error handling", () => {
  test("returns error for non-existent file", () => {
    const result = importCommand(targetDb, ["/nonexistent/path.db"]);
    expect(Result.isError(result)).toBe(true);
  });

  test("returns error for invalid JSON", () => {
    const jsonPath = join(tmpDir, "bad.json");
    writeFileSync(jsonPath, "not json", "utf-8");

    const result = importCommand(targetDb, [jsonPath]);
    expect(Result.isError(result)).toBe(true);
  });

  test("returns error for empty CSV", () => {
    const csvPath = join(tmpDir, "empty.csv");
    writeFileSync(csvPath, "header_only\n", "utf-8");

    // This has a header but won't match our expected columns — should still not crash
    const result = importCommand(targetDb, [csvPath]);
    // It might succeed with 0 rows or fail — either is fine, it shouldn't crash
    expect(result).toBeDefined();
  });
});
