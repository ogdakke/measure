import { test, expect, describe, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { migrate } from "../../src/db/schema.ts";
import { benchCommand } from "../../src/commands/bench.ts";
import { getHistory } from "../../src/db/queries.ts";
import { Result } from "better-result";

let db: Database;

beforeEach(() => {
  db = new Database(":memory:", { strict: true });
  migrate(db);
});

describe("benchCommand", () => {
  test("runs N iterations and stores all with same bench_group", async () => {
    const result = await benchCommand(db, 3, 0, ["echo", "bench"], "tester");

    expect(Result.isOk(result)).toBe(true);
    const stats = result.unwrap();
    expect(stats.count).toBe(3);
    expect(stats.min).toBeGreaterThan(0);
    expect(stats.max).toBeGreaterThanOrEqual(stats.min);
    expect(stats.mean).toBeGreaterThan(0);

    // All 3 should share the same bench_group
    const history = getHistory(db, { limit: 10 });
    const rows = history.unwrap();
    expect(rows.length).toBe(3);

    const groups = new Set(rows.map((r) => r.benchGroup));
    expect(groups.size).toBe(1);
    expect(rows[0]!.benchGroup).not.toBeNull();
  });
});
