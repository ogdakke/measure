import { test, expect, describe } from "bun:test";
import { parseArgs, extractDbFlag } from "../../src/cli.ts";
import { Result } from "better-result";

const argv = (...args: string[]) =>
  parseArgs(["/path/to/bun", "/path/to/measure", ...args]);

describe("parseArgs — db command", () => {
  test("db with no args defaults to list", () => {
    const result = argv("db");
    expect(result.unwrap()).toEqual({ command: "db", action: "list" });
  });

  test("db list", () => {
    const result = argv("db", "list");
    expect(result.unwrap()).toEqual({ command: "db", action: "list" });
  });

  test("db create requires a name", () => {
    const result = argv("db", "create");
    expect(Result.isError(result)).toBe(true);
  });

  test("db create with valid name", () => {
    const result = argv("db", "create", "team-april");
    expect(result.unwrap()).toEqual({
      command: "db",
      action: "create",
      name: "team-april",
    });
  });

  test("db create rejects 'default' name", () => {
    const result = argv("db", "create", "default");
    expect(Result.isError(result)).toBe(true);
  });

  test("db create rejects invalid characters", () => {
    const result = argv("db", "create", "my db!");
    expect(Result.isError(result)).toBe(true);
  });

  test("db use requires a name", () => {
    const result = argv("db", "use");
    expect(Result.isError(result)).toBe(true);
  });

  test("db use with name", () => {
    const result = argv("db", "use", "team-april");
    expect(result.unwrap()).toEqual({
      command: "db",
      action: "use",
      name: "team-april",
    });
  });

  test("db unknown action returns error", () => {
    const result = argv("db", "drop");
    expect(Result.isError(result)).toBe(true);
  });
});

describe("parseArgs — import command", () => {
  test("import with no files returns error", () => {
    const result = argv("import");
    expect(Result.isError(result)).toBe(true);
  });

  test("import with .db file", () => {
    const result = argv("import", "data.db");
    expect(result.unwrap()).toEqual({
      command: "import",
      files: ["data.db"],
    });
  });

  test("import with multiple files", () => {
    const result = argv("import", "a.db", "b.csv", "c.json");
    expect(result.unwrap()).toEqual({
      command: "import",
      files: ["a.db", "b.csv", "c.json"],
    });
  });

  test("import rejects unsupported format", () => {
    const result = argv("import", "data.xml");
    expect(Result.isError(result)).toBe(true);
  });

  test("import rejects mixed valid/invalid formats", () => {
    const result = argv("import", "good.db", "bad.txt");
    expect(Result.isError(result)).toBe(true);
  });
});

describe("extractDbFlag", () => {
  test("extracts --db from argv", () => {
    const { dbName, argv: cleaned } = extractDbFlag([
      "bun", "measure", "--db", "team", "history",
    ]);
    expect(dbName).toBe("team");
    expect(cleaned).toEqual(["bun", "measure", "history"]);
  });

  test("returns undefined if no --db flag", () => {
    const { dbName, argv: cleaned } = extractDbFlag([
      "bun", "measure", "history",
    ]);
    expect(dbName).toBeUndefined();
    expect(cleaned).toEqual(["bun", "measure", "history"]);
  });

  test("handles --db at end of argv (no value)", () => {
    const { dbName, argv: cleaned } = extractDbFlag([
      "bun", "measure", "--db",
    ]);
    expect(dbName).toBeUndefined();
    expect(cleaned).toEqual(["bun", "measure", "--db"]);
  });

  test("handles --db in the middle of args", () => {
    const { dbName, argv: cleaned } = extractDbFlag([
      "bun", "measure", "stats", "--db", "combined", "--host", "mac-1",
    ]);
    expect(dbName).toBe("combined");
    expect(cleaned).toEqual(["bun", "measure", "stats", "--host", "mac-1"]);
  });
});
