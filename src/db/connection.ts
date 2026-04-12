import { Database } from "bun:sqlite";
import { Result } from "better-result";
import { homedir } from "node:os";
import { join, basename } from "node:path";
import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { DatabaseError } from "../errors.ts";
import { migrate } from "./schema.ts";

const instances = new Map<string, Database>();

/** Clear the database instance cache (for testing). */
export function resetConnectionCache(): void {
  instances.clear();
}

export function getMeasureDir(): string {
  return join(homedir(), ".measure");
}

/** Resolve a database name to its file path. "default" → measure.db, anything else → <name>.db */
export function dbNameToPath(name: string): string {
  const filename = name === "default" ? "measure.db" : `${name}.db`;
  return join(getMeasureDir(), filename);
}

/** Resolve a .db file path back to its logical name. */
export function pathToDbName(filePath: string): string {
  const file = basename(filePath);
  if (file === "measure.db") return "default";
  return file.replace(/\.db$/, "");
}

/** Read the active database name from ~/.measure/active. Defaults to "default". */
export function getActiveDbName(): string {
  try {
    const content = readFileSync(join(getMeasureDir(), "active"), "utf-8").trim();
    return content || "default";
  } catch {
    return "default";
  }
}

/** Write the active database name to ~/.measure/active. */
export function setActiveDbName(name: string): void {
  mkdirSync(getMeasureDir(), { recursive: true });
  writeFileSync(join(getMeasureDir(), "active"), name, "utf-8");
}

/** List all database names in ~/.measure/. */
export function listDatabases(): string[] {
  const dir = getMeasureDir();
  if (!existsSync(dir)) return ["default"];
  const files = readdirSync(dir).filter(
    (f) => f.endsWith(".db") && !f.endsWith("-shm") && !f.endsWith("-wal"),
  );
  const names = files.map((f) => pathToDbName(join(dir, f)));
  if (!names.includes("default")) names.unshift("default");
  return names.sort((a, b) => (a === "default" ? -1 : b === "default" ? 1 : a.localeCompare(b)));
}

/** Check if a named database exists on disk. */
export function databaseExists(name: string): boolean {
  return existsSync(dbNameToPath(name));
}

export function getDbPath(): string {
  return dbNameToPath(getActiveDbName());
}

/**
 * Open a database by name. Uses the active DB if no name is given.
 * Caches instances by name.
 */
export function getDatabase(name?: string): Result<Database, DatabaseError> {
  const dbName = name ?? getActiveDbName();

  const cached = instances.get(dbName);
  if (cached) return Result.ok(cached);

  return Result.try({
    try: () => {
      const dbPath = dbNameToPath(dbName);
      mkdirSync(getMeasureDir(), { recursive: true });

      const db = new Database(dbPath, { create: true, strict: true });
      db.run("PRAGMA journal_mode = WAL");
      migrate(db);

      instances.set(dbName, db);
      return db;
    },
    catch: (e) =>
      new DatabaseError({ message: `Failed to open database: ${e}` }),
  });
}

/** Open a database at an arbitrary path (for importing). Not cached. */
export function openDatabaseAt(path: string): Result<Database, DatabaseError> {
  return Result.try({
    try: () => {
      const db = new Database(path, { readonly: true, strict: true });
      return db;
    },
    catch: (e) =>
      new DatabaseError({ message: `Failed to open database at ${path}: ${e}` }),
  });
}

/** Open an in-memory database (for testing). */
export function getMemoryDatabase(): Database {
  const db = new Database(":memory:", { strict: true });
  migrate(db);
  return db;
}
