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
import { bold, dim, cyan, green } from "../format/colors.ts";

export function dbListCommand(): void {
  const active = getActiveDbName();
  const databases = listDatabases();

  console.log();
  console.log(`  ${bold("Databases:")}`);
  for (const name of databases) {
    const marker = name === active ? green(" (active)") : "";
    const path = dim(dbNameToPath(name));
    console.log(`    ${cyan(name)}${marker}  ${path}`);
  }
  console.log();
}

export function dbCreateCommand(
  name: string,
): Result<void, DatabaseError> {
  if (databaseExists(name)) {
    return Result.err(
      new DatabaseError({ message: `Database '${name}' already exists.` }),
    );
  }

  const dbResult = getDatabase(name);
  if (dbResult.isErr()) return dbResult.map(() => undefined);

  console.log(`  Created database ${cyan(name)} at ${dim(dbNameToPath(name))}`);
  return Result.ok(undefined);
}

export function dbUseCommand(name: string): Result<void, DatabaseError> {
  if (name !== "default" && !databaseExists(name)) {
    return Result.err(
      new DatabaseError({
        message: `Database '${name}' does not exist. Create it first with: measure db create ${name}`,
      }),
    );
  }

  setActiveDbName(name);
  console.log(`  Switched to database ${cyan(name)}`);
  return Result.ok(undefined);
}
