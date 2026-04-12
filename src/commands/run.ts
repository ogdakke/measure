import { Result } from "better-result";
import type { Database } from "bun:sqlite";
import { executeCommand } from "../runner/execute.ts";
import { insertMeasurement } from "../db/queries.ts";
import { getSystemInfo } from "../system/metadata.ts";
import { detectProject } from "../system/project.ts";
import type { CommandError, DatabaseError } from "../errors.ts";
import type { Measurement } from "../types.ts";

export async function runCommand(
  db: Database,
  args: string[],
  username: string,
): Promise<Result<Measurement, CommandError | DatabaseError>> {
  const command = args.join(" ");
  const system = getSystemInfo(username);
  const project = detectProject(process.cwd());

  const result = await executeCommand(command);
  if (result.isErr()) {
    return Result.err<Measurement, CommandError | DatabaseError>(result.error);
  }

  const execution = result.value;
  const saved = insertMeasurement(db, {
    command,
    project,
    execution,
    system,
    cwd: process.cwd(),
    benchGroup: null,
  });

  return saved;
}
