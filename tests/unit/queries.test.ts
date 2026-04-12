import { test, expect, describe, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { migrate } from "../../src/db/schema.ts";
import {
  insertMeasurement,
  getHistory,
  getStatsData,
  getExportData,
  getConfig,
  setConfig,
} from "../../src/db/queries.ts";
import { Result } from "better-result";
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

describe("config", () => {
  test("getConfig returns null for missing key", () => {
    expect(getConfig(db, "missing")).toBeNull();
  });

  test("setConfig and getConfig round-trip", () => {
    setConfig(db, "username", "Daniel");
    expect(getConfig(db, "username")).toBe("Daniel");
  });

  test("setConfig overwrites existing value", () => {
    setConfig(db, "username", "Alice");
    setConfig(db, "username", "Bob");
    expect(getConfig(db, "username")).toBe("Bob");
  });
});

describe("insertMeasurement", () => {
  test("inserts and returns a measurement", () => {
    const result = insertMeasurement(db, {
      command: "echo hello",
      project: "test-project",
      execution: mockExecution,
      system: mockSystem,
      cwd: "/tmp",
      benchGroup: null,
    });

    expect(Result.isOk(result)).toBe(true);
    const m = result.unwrap();
    expect(m.command).toBe("echo hello");
    expect(m.project).toBe("test-project");
    expect(m.durationNs).toBe(5_000_000);
    expect(m.exitCode).toBe(0);
    expect(m.hostname).toBe("test-mac");
    expect(m.id).toBeGreaterThan(0);
  });

  test("handles null project", () => {
    const result = insertMeasurement(db, {
      command: "ls",
      project: null,
      execution: mockExecution,
      system: mockSystem,
      cwd: "/tmp",
      benchGroup: null,
    });

    expect(Result.isOk(result)).toBe(true);
    expect(result.unwrap().project).toBeNull();
  });
});

describe("getHistory", () => {
  test("returns measurements in reverse chronological order", () => {
    for (const cmd of ["first", "second", "third"]) {
      insertMeasurement(db, {
        command: cmd,
        project: null,
        execution: mockExecution,
        system: mockSystem,
        cwd: "/tmp",
        benchGroup: null,
      });
    }

    const result = getHistory(db, { limit: 10 });
    expect(Result.isOk(result)).toBe(true);
    const rows = result.unwrap();
    expect(rows.length).toBe(3);
    expect(rows[0]!.command).toBe("third");
    expect(rows[2]!.command).toBe("first");
  });

  test("respects limit", () => {
    for (let i = 0; i < 5; i++) {
      insertMeasurement(db, {
        command: `cmd-${i}`,
        project: null,
        execution: mockExecution,
        system: mockSystem,
        cwd: "/tmp",
        benchGroup: null,
      });
    }

    const result = getHistory(db, { limit: 2 });
    expect(result.unwrap().length).toBe(2);
  });

  test("filters by project", () => {
    insertMeasurement(db, {
      command: "build",
      project: "app-a",
      execution: mockExecution,
      system: mockSystem,
      cwd: "/tmp",
      benchGroup: null,
    });
    insertMeasurement(db, {
      command: "build",
      project: "app-b",
      execution: mockExecution,
      system: mockSystem,
      cwd: "/tmp",
      benchGroup: null,
    });

    const result = getHistory(db, { limit: 10, project: "app-a" });
    const rows = result.unwrap();
    expect(rows.length).toBe(1);
    expect(rows[0]!.project).toBe("app-a");
  });
});

describe("getStatsData", () => {
  test("returns all measurements matching filters", () => {
    insertMeasurement(db, {
      command: "build",
      project: "app",
      execution: mockExecution,
      system: mockSystem,
      cwd: "/tmp",
      benchGroup: null,
    });

    const result = getStatsData(db, { project: "app" });
    expect(result.unwrap().length).toBe(1);
  });
});

describe("getExportData", () => {
  test("returns all data in chronological order", () => {
    for (const cmd of ["first", "second", "third"]) {
      insertMeasurement(db, {
        command: cmd,
        project: null,
        execution: mockExecution,
        system: mockSystem,
        cwd: "/tmp",
        benchGroup: null,
      });
    }

    const result = getExportData(db, {});
    const rows = result.unwrap();
    expect(rows.length).toBe(3);
    expect(rows[0]!.command).toBe("first");
    expect(rows[2]!.command).toBe("third");
  });
});
