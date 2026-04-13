import { test, expect, describe, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { migrate } from "../../src/db/schema.ts";
import { runCommand } from "../../src/commands/run.ts";
import { getHistory } from "../../src/db/queries.ts";
import { Result } from "better-result";

let db: Database;

beforeEach(() => {
  db = new Database(":memory:", { strict: true });
  migrate(db);
});

describe("runCommand", () => {
  test("executes a command and stores the result", async () => {
    const result = await runCommand(db, ["echo", "integration test"], "tester");

    expect(Result.isOk(result)).toBe(true);
    const measurement = result.unwrap();
    expect(measurement.command).toBe("echo integration test");
    expect(measurement.exitCode).toBe(0);
    expect(measurement.durationNs).toBeGreaterThan(0);
    expect(measurement.username).toBe("tester");

    // Verify it was saved to the DB
    const history = getHistory(db, { limit: 1 });
    expect(history.unwrap().length).toBe(1);
    expect(history.unwrap()[0]!.command).toBe("echo integration test");
  });

  test("captures non-zero exit codes", async () => {
    const result = await runCommand(db, ["exit 42"], "tester");

    expect(Result.isOk(result)).toBe(true);
    expect(result.unwrap().exitCode).toBe(42);
  });

  test("preserves spaced argv values for direct command execution", async () => {
    const result = await runCommand(
      db,
      [
        "bun",
        "-e",
        "process.exit(process.argv[1] === 'foo bar' ? 0 : 7)",
        "--",
        "foo bar",
      ],
      "tester",
    );

    expect(Result.isOk(result)).toBe(true);
    expect(result.unwrap().exitCode).toBe(0);
  });
});
