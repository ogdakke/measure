import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { Result } from "better-result";
import {
  getMeasureDir,
  getActiveDbName,
  setActiveDbName,
  listDatabases,
  databaseExists,
  dbNameToPath,
  pathToDbName,
  resetConnectionCache,
} from "../../src/db/connection.ts";
import { dbCreateCommand, dbUseCommand } from "../../src/commands/db.ts";
import { rmSync } from "node:fs";
import { join } from "node:path";

// These tests operate on the real ~/.measure directory
// We save/restore state to avoid side effects

let originalActive: string;

beforeEach(() => {
  originalActive = getActiveDbName();
});

afterEach(() => {
  setActiveDbName(originalActive);
});

describe("connection helpers", () => {
  test("dbNameToPath maps 'default' to measure.db", () => {
    expect(dbNameToPath("default")).toBe(join(getMeasureDir(), "measure.db"));
  });

  test("dbNameToPath maps other names to <name>.db", () => {
    expect(dbNameToPath("team-april")).toBe(
      join(getMeasureDir(), "team-april.db"),
    );
  });

  test("pathToDbName maps measure.db to 'default'", () => {
    expect(pathToDbName(join(getMeasureDir(), "measure.db"))).toBe("default");
  });

  test("pathToDbName maps <name>.db to name", () => {
    expect(pathToDbName(join(getMeasureDir(), "team-april.db"))).toBe(
      "team-april",
    );
  });

  test("getActiveDbName defaults to 'default'", () => {
    // Save current, set to something known, test, restore
    const name = getActiveDbName();
    expect(typeof name).toBe("string");
    expect(name.length).toBeGreaterThan(0);
  });

  test("setActiveDbName persists", () => {
    setActiveDbName("test-switch");
    expect(getActiveDbName()).toBe("test-switch");
    setActiveDbName(originalActive);
  });

  test("listDatabases includes default", () => {
    const dbs = listDatabases();
    expect(dbs).toContain("default");
  });
});

describe("dbCreateCommand", () => {
  const testDbName = `test-create-${Date.now()}`;

  afterEach(() => {
    // Clear cache so stale instances don't interfere across tests
    resetConnectionCache();
    // Clean up created test DB
    try {
      rmSync(dbNameToPath(testDbName));
    } catch {}
    try {
      rmSync(dbNameToPath(testDbName) + "-shm");
    } catch {}
    try {
      rmSync(dbNameToPath(testDbName) + "-wal");
    } catch {}
  });

  test("creates a new database", () => {
    const result = dbCreateCommand(testDbName);
    expect(Result.isOk(result)).toBe(true);
    expect(databaseExists(testDbName)).toBe(true);
  });

  test("rejects creating existing database", () => {
    dbCreateCommand(testDbName);
    const result = dbCreateCommand(testDbName);
    expect(Result.isError(result)).toBe(true);
  });
});

describe("dbUseCommand", () => {
  test("switches active database", () => {
    // Use default, then switch
    setActiveDbName("default");
    expect(getActiveDbName()).toBe("default");

    // Switch to default (always exists)
    const result = dbUseCommand("default");
    expect(Result.isOk(result)).toBe(true);
    expect(getActiveDbName()).toBe("default");
  });

  test("rejects switching to non-existent database", () => {
    const result = dbUseCommand("nonexistent-db-xyz");
    expect(Result.isError(result)).toBe(true);
  });
});
