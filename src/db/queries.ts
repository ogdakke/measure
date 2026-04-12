import type { Database } from "bun:sqlite";
import { Result } from "better-result";
import { DatabaseError, describeUnknownError } from "../errors.ts";
import type { Measurement, SystemInfo, ExecutionResult, ExportFilters } from "../types.ts";

/** The raw row shape returned by SQLite (snake_case column names). */
interface MeasurementRow {
  id: number;
  command: string;
  project: string | null;
  duration_ns: number;
  exit_code: number;
  cpu_user_us: number | null;
  cpu_system_us: number | null;
  max_rss: number | null;
  os: string;
  cpu_model: string;
  cpu_cores: number;
  ram_bytes: number;
  hostname: string;
  username: string;
  cwd: string;
  shell: string | null;
  bun_version: string;
  bench_group: string | null;
  created_at: string;
}

export function getConfig(db: Database, key: string): string | null {
  const row = db
    .query<{ value: string }, { key: string }>("SELECT value FROM config WHERE key = $key")
    .get({ key });
  return row?.value ?? null;
}

export function setConfig(db: Database, key: string, value: string): void {
  db.query<void, { key: string; value: string }>(
    "INSERT OR REPLACE INTO config (key, value) VALUES ($key, $value)",
  ).run({ key, value });
}

export interface InsertParams {
  command: string;
  project: string | null;
  execution: ExecutionResult;
  system: SystemInfo;
  cwd: string;
  benchGroup: string | null;
}

type InsertBindings = Record<
  string,
  string | bigint | NodeJS.TypedArray | number | boolean | null
> & {
  command: string;
  project: string | null;
  duration_ns: number;
  exit_code: number;
  cpu_user_us: number | null;
  cpu_system_us: number | null;
  max_rss: number | null;
  os: string;
  cpu_model: string;
  cpu_cores: number;
  ram_bytes: number;
  hostname: string;
  username: string;
  cwd: string;
  shell: string | null;
  bun_version: string;
  bench_group: string | null;
};

export function insertMeasurement(
  db: Database,
  params: InsertParams,
): Result<Measurement, DatabaseError> {
  return Result.try({
    try: () => {
      const { command, project, execution, system, cwd, benchGroup } = params;

      const row = db
        .query<MeasurementRow, InsertBindings>(
          `INSERT INTO measurements (
            command, project, duration_ns, exit_code,
            cpu_user_us, cpu_system_us, max_rss,
            os, cpu_model, cpu_cores, ram_bytes,
            hostname, username, cwd, shell, bun_version, bench_group
          ) VALUES (
            $command, $project, $duration_ns, $exit_code,
            $cpu_user_us, $cpu_system_us, $max_rss,
            $os, $cpu_model, $cpu_cores, $ram_bytes,
            $hostname, $username, $cwd, $shell, $bun_version, $bench_group
          ) RETURNING *`,
        )
        .get({
          command,
          project,
          duration_ns: execution.durationNs,
          exit_code: execution.exitCode,
          cpu_user_us: execution.cpuUserUs,
          cpu_system_us: execution.cpuSystemUs,
          max_rss: execution.maxRss,
          os: system.os,
          cpu_model: system.cpuModel,
          cpu_cores: system.cpuCores,
          ram_bytes: system.ramBytes,
          hostname: system.hostname,
          username: system.username,
          cwd,
          shell: system.shell,
          bun_version: system.bunVersion,
          bench_group: benchGroup,
        })!;

      return rowToMeasurement(row);
    },
    catch: (e) =>
      new DatabaseError({
        message: `Failed to insert measurement: ${describeUnknownError(e)}`,
      }),
  });
}

export function getHistory(
  db: Database,
  filters: ExportFilters & { limit: number },
): Result<Measurement[], DatabaseError> {
  return Result.try({
    try: () => {
      const { where, bindings } = buildWhere(filters);
      const rows = db
        .query<MeasurementRow, Record<string, string | number>>(
          `SELECT * FROM measurements ${where} ORDER BY created_at DESC LIMIT $limit`,
        )
        .all({ ...bindings, limit: filters.limit });
      return rows.map(rowToMeasurement);
    },
    catch: (e) =>
      new DatabaseError({ message: `Failed to query history: ${describeUnknownError(e)}` }),
  });
}

export function getStatsData(
  db: Database,
  filters: ExportFilters,
): Result<Measurement[], DatabaseError> {
  return Result.try({
    try: () => {
      const { where, bindings } = buildWhere(filters);
      const rows = db
        .query<MeasurementRow, Record<string, string>>(
          `SELECT * FROM measurements ${where} ORDER BY command, hostname`,
        )
        .all(bindings);
      return rows.map(rowToMeasurement);
    },
    catch: (e) =>
      new DatabaseError({ message: `Failed to query stats: ${describeUnknownError(e)}` }),
  });
}

export function getExportData(
  db: Database,
  filters: ExportFilters,
): Result<Measurement[], DatabaseError> {
  return Result.try({
    try: () => {
      const { where, bindings } = buildWhere(filters);
      const rows = db
        .query<MeasurementRow, Record<string, string>>(
          `SELECT * FROM measurements ${where} ORDER BY created_at ASC`,
        )
        .all(bindings);
      return rows.map(rowToMeasurement);
    },
    catch: (e) =>
      new DatabaseError({
        message: `Failed to query export data: ${describeUnknownError(e)}`,
      }),
  });
}

function buildWhere(filters: ExportFilters): {
  where: string;
  bindings: Record<string, string>;
} {
  const clauses: string[] = [];
  const bindings: Record<string, string> = {};

  if (filters.project) {
    clauses.push("project = $project");
    bindings.project = filters.project;
  }
  if (filters.command) {
    clauses.push("command LIKE $command");
    bindings.command = `%${filters.command}%`;
  }
  if (filters.host) {
    clauses.push("hostname = $host");
    bindings.host = filters.host;
  }

  const where = clauses.length > 0 ? "WHERE " + clauses.join(" AND ") : "";
  return { where, bindings };
}

function rowToMeasurement(row: MeasurementRow): Measurement {
  return {
    id: row.id,
    command: row.command,
    project: row.project,
    durationNs: row.duration_ns,
    exitCode: row.exit_code,
    cpuUserUs: row.cpu_user_us,
    cpuSystemUs: row.cpu_system_us,
    maxRss: row.max_rss,
    os: row.os,
    cpuModel: row.cpu_model,
    cpuCores: row.cpu_cores,
    ramBytes: row.ram_bytes,
    hostname: row.hostname,
    username: row.username,
    cwd: row.cwd,
    shell: row.shell,
    bunVersion: row.bun_version,
    benchGroup: row.bench_group,
    createdAt: row.created_at,
  };
}
