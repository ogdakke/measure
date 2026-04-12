import { test, expect, describe } from "bun:test";
import { Database } from "bun:sqlite";
import { migrate } from "../../src/db/schema.ts";

describe("schema migration", () => {
  test("creates tables on fresh database", () => {
    const db = new Database(":memory:", { strict: true });
    migrate(db);

    const tables = db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      )
      .all();
    const names = tables.map((t) => t.name);

    expect(names).toContain("measurements");
    expect(names).toContain("config");
    expect(names).toContain("schema_version");
  });

  test("records schema version", () => {
    const db = new Database(":memory:", { strict: true });
    migrate(db);

    const row = db
      .query<{ v: number }, []>("SELECT MAX(version) as v FROM schema_version")
      .get();
    expect(row?.v).toBe(1);
  });

  test("migration is idempotent", () => {
    const db = new Database(":memory:", { strict: true });
    migrate(db);
    migrate(db); // should not throw

    const row = db
      .query<{ v: number }, []>("SELECT MAX(version) as v FROM schema_version")
      .get();
    expect(row?.v).toBe(1);
  });
});
