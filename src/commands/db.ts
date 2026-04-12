import { Result } from "better-result";
import { DatabaseError } from "../errors.ts";
import {
  listDatabases,
  getActiveDbName,
  setActiveDbName,
  getDatabase,
  databaseExists,
  dbNameToPath,
} from "../db/connection.ts";

export interface DbInfo {
  name: string;
  path: string;
  active: boolean;
}

export function dbListCommand(): DbInfo[] {
  const active = getActiveDbName();
  const databases = listDatabases();
  return databases.map((name) => ({
    name,
    path: dbNameToPath(name),
    active: name === active,
  }));
}

export function dbCreateCommand(
  name: string,
): Result<{ name: string; path: string }, DatabaseError> {
  if (databaseExists(name)) {
    return Result.err(new DatabaseError({ message: `Database '${name}' already exists.` }));
  }

  const dbResult = getDatabase(name);
  if (dbResult.isErr()) return dbResult.map(() => ({ name, path: dbNameToPath(name) }));

  return Result.ok({ name, path: dbNameToPath(name) });
}

export function dbUseCommand(name: string): Result<string, DatabaseError> {
  if (name !== "default" && !databaseExists(name)) {
    return Result.err(
      new DatabaseError({
        message: `Database '${name}' does not exist. Create it first with: measure db create ${name}`,
      }),
    );
  }

  setActiveDbName(name);
  return Result.ok(name);
}
