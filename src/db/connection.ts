import { Database } from "bun:sqlite";
import { Result } from "better-result";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { DatabaseError } from "../errors.ts";
import { migrate } from "./schema.ts";

let instance: Database | null = null;

export function getDbPath(): string {
  return join(homedir(), ".measure", "measure.db");
}

export function getDatabase(): Result<Database, DatabaseError> {
  if (instance) return Result.ok(instance);

  return Result.try({
    try: () => {
      const dbPath = getDbPath();
      mkdirSync(join(homedir(), ".measure"), { recursive: true });

      const db = new Database(dbPath, { create: true, strict: true });
      db.run("PRAGMA journal_mode = WAL");
      migrate(db);

      instance = db;
      return db;
    },
    catch: (e) =>
      new DatabaseError({ message: `Failed to open database: ${e}` }),
  });
}

/** Open an in-memory database (for testing). */
export function getMemoryDatabase(): Database {
  const db = new Database(":memory:", { strict: true });
  migrate(db);
  return db;
}
