import { Result } from "better-result";
import type { Database } from "bun:sqlite";
import { getExportData } from "../db/queries.ts";
import { ExportError, type DatabaseError } from "../errors.ts";
import type { Measurement } from "../types.ts";

export interface ExportResult {
  count: number;
  path?: string;
}

export function exportCommand(
  db: Database,
  format: "csv" | "json",
  project?: string,
  commandFilter?: string,
  host?: string,
  output?: string,
): Result<ExportResult, DatabaseError | ExportError> {
  const result = getExportData(db, {
    project,
    command: commandFilter,
    host,
  });
  if (result.isErr()) return result;

  const measurements = result.value;
  const content =
    format === "json" ? toJson(measurements) : toCsv(measurements);

  if (output) {
    const writeResult = Result.try({
      try: () => {
        require("node:fs").writeFileSync(output, content, "utf-8");
      },
      catch: (e) =>
        new ExportError({ message: `Failed to write to ${output}: ${e}` }),
    });
    if (writeResult.isErr()) return writeResult;
    return Result.ok({ count: measurements.length, path: output });
  } else {
    process.stdout.write(content);
    return Result.ok({ count: measurements.length });
  }
}

const CSV_COLUMNS = [
  "id",
  "command",
  "project",
  "duration_ns",
  "exit_code",
  "cpu_user_us",
  "cpu_system_us",
  "max_rss",
  "os",
  "cpu_model",
  "cpu_cores",
  "ram_bytes",
  "hostname",
  "username",
  "cwd",
  "shell",
  "bun_version",
  "bench_group",
  "created_at",
] as const;

function toCsv(measurements: Measurement[]): string {
  const header = CSV_COLUMNS.join(",");
  const rows = measurements.map((m) =>
    [
      m.id,
      csvEscape(m.command),
      csvEscape(m.project ?? ""),
      m.durationNs,
      m.exitCode,
      m.cpuUserUs ?? "",
      m.cpuSystemUs ?? "",
      m.maxRss ?? "",
      m.os,
      csvEscape(m.cpuModel),
      m.cpuCores,
      m.ramBytes,
      m.hostname,
      m.username,
      csvEscape(m.cwd),
      m.shell ?? "",
      m.bunVersion,
      m.benchGroup ?? "",
      m.createdAt,
    ].join(","),
  );
  return header + "\n" + rows.join("\n") + "\n";
}

function toJson(measurements: Measurement[]): string {
  return JSON.stringify(measurements, null, 2) + "\n";
}

function csvEscape(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}
