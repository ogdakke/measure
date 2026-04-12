import { Result } from "better-result";
import type { Database } from "bun:sqlite";
import { getHistory } from "../db/queries.ts";
import type { DatabaseError } from "../errors.ts";
import type { Measurement } from "../types.ts";

export function historyCommand(
  db: Database,
  limit: number,
  project?: string,
  commandFilter?: string,
): Result<Measurement[], DatabaseError> {
  return getHistory(db, {
    limit,
    project,
    command: commandFilter,
  });
}
