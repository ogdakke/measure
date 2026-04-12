import { Database } from "bun:sqlite";
import { Result } from "better-result";
import { readFileSync, existsSync } from "node:fs";
import { resolve, basename } from "node:path";
import { DatabaseError, ExportError } from "../errors.ts";

export interface ImportResult {
  file: string;
  imported: number;
  skipped: number;
}

export function importCommand(
  db: Database,
  files: string[],
): Result<ImportResult[], DatabaseError | ExportError> {
  const results: ImportResult[] = [];

  for (const file of files) {
    const absPath = resolve(file);
    if (!existsSync(absPath)) {
      return Result.err(new ExportError({ message: `File not found: ${absPath}` }));
    }

    let result: Result<ImportResult, DatabaseError | ExportError>;
    if (absPath.endsWith(".db")) {
      result = importFromDb(db, absPath);
    } else if (absPath.endsWith(".json")) {
      result = importFromJson(db, absPath);
    } else if (absPath.endsWith(".csv")) {
      result = importFromCsv(db, absPath);
    } else {
      return Result.err(
        new ExportError({
          message: `Unsupported file format: ${basename(absPath)}. Use .db, .csv, or .json.`,
        }),
      );
    }

    if (result.isErr()) return result.map(() => []);
    results.push(result.value);
  }

  return Result.ok(results);
}

function importFromDb(targetDb: Database, sourcePath: string): Result<ImportResult, DatabaseError> {
  return Result.try({
    try: () => {
      // Verify the source is a valid measure database
      const sourceDb = new Database(sourcePath, {
        readonly: true,
        strict: true,
      });

      // Check it has a measurements table
      const tableCheck = sourceDb
        .query<{ name: string }, []>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='measurements'",
        )
        .get();
      if (!tableCheck) {
        sourceDb.close();
        throw new Error(
          `${sourcePath} does not appear to be a measure database (no measurements table)`,
        );
      }
      sourceDb.close();

      // Use ATTACH to import efficiently
      targetDb.run(`ATTACH DATABASE '${sourcePath}' AS source`);

      try {
        const countBefore = targetDb
          .query<{ c: number }, []>("SELECT COUNT(*) as c FROM measurements")
          .get()!.c;

        targetDb.run(`
          INSERT INTO measurements (
            command, project, duration_ns, exit_code,
            cpu_user_us, cpu_system_us, max_rss,
            os, cpu_model, cpu_cores, ram_bytes,
            hostname, username, cwd, shell, bun_version,
            bench_group, created_at
          )
          SELECT
            s.command, s.project, s.duration_ns, s.exit_code,
            s.cpu_user_us, s.cpu_system_us, s.max_rss,
            s.os, s.cpu_model, s.cpu_cores, s.ram_bytes,
            s.hostname, s.username, s.cwd, s.shell, s.bun_version,
            s.bench_group, s.created_at
          FROM source.measurements s
          WHERE NOT EXISTS (
            SELECT 1 FROM measurements m
            WHERE m.command = s.command
              AND m.hostname = s.hostname
              AND m.username = s.username
              AND m.created_at = s.created_at
          )
        `);

        const countAfter = targetDb
          .query<{ c: number }, []>("SELECT COUNT(*) as c FROM measurements")
          .get()!.c;

        const sourceCount = targetDb
          .query<{ c: number }, []>("SELECT COUNT(*) as c FROM source.measurements")
          .get()!.c;

        const imported = countAfter - countBefore;
        return {
          file: sourcePath,
          imported,
          skipped: sourceCount - imported,
        };
      } finally {
        targetDb.run("DETACH DATABASE source");
      }
    },
    catch: (e) => new DatabaseError({ message: `Failed to import from ${sourcePath}: ${e}` }),
  });
}

function importFromJson(
  db: Database,
  filePath: string,
): Result<ImportResult, DatabaseError | ExportError> {
  return Result.try({
    try: () => {
      const content = readFileSync(filePath, "utf-8");
      const data = JSON.parse(content);

      if (!Array.isArray(data)) {
        throw new Error(`Expected a JSON array in ${filePath}`);
      }

      return importRows(db, filePath, data, "json");
    },
    catch: (e) => new ExportError({ message: `Failed to import JSON from ${filePath}: ${e}` }),
  });
}

function importFromCsv(
  db: Database,
  filePath: string,
): Result<ImportResult, DatabaseError | ExportError> {
  return Result.try({
    try: () => {
      const content = readFileSync(filePath, "utf-8");
      const lines = content.trim().split("\n");
      if (lines.length < 2) {
        throw new Error(`CSV file ${filePath} has no data rows`);
      }

      const headers = parseCsvLine(lines[0]!);
      const rows = [];
      for (let i = 1; i < lines.length; i++) {
        const values = parseCsvLine(lines[i]!);
        const row: Record<string, string> = {};
        for (let j = 0; j < headers.length; j++) {
          row[headers[j]!] = values[j] ?? "";
        }
        rows.push(row);
      }

      return importRows(db, filePath, rows, "csv");
    },
    catch: (e) => new ExportError({ message: `Failed to import CSV from ${filePath}: ${e}` }),
  });
}

/** Parse a CSV line, handling quoted fields with escaped quotes. */
function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        current += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ",") {
        values.push(current);
        current = "";
        i++;
      } else {
        current += ch;
        i++;
      }
    }
  }
  values.push(current);
  return values;
}

/**
 * Import parsed rows (from JSON or CSV) into the database.
 * JSON rows use camelCase keys (Measurement interface).
 * CSV rows use snake_case keys (DB column names).
 */
function importRows(
  db: Database,
  filePath: string,
  rows: Record<string, unknown>[],
  source: "json" | "csv",
): ImportResult {
  const insertStmt = db.query<
    void,
    {
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
  >(`INSERT INTO measurements (
      command, project, duration_ns, exit_code,
      cpu_user_us, cpu_system_us, max_rss,
      os, cpu_model, cpu_cores, ram_bytes,
      hostname, username, cwd, shell, bun_version,
      bench_group, created_at
    ) VALUES (
      $command, $project, $duration_ns, $exit_code,
      $cpu_user_us, $cpu_system_us, $max_rss,
      $os, $cpu_model, $cpu_cores, $ram_bytes,
      $hostname, $username, $cwd, $shell, $bun_version,
      $bench_group, $created_at
    )`);

  const checkStmt = db.query<
    { c: number },
    { command: string; hostname: string; username: string; created_at: string }
  >(
    `SELECT COUNT(*) as c FROM measurements
     WHERE command = $command AND hostname = $hostname AND username = $username AND created_at = $created_at`,
  );

  let imported = 0;
  let skipped = 0;

  const runImport = db.transaction(() => {
    for (const row of rows) {
      const command = str(row, source === "json" ? "command" : "command");
      const hostname = str(row, source === "json" ? "hostname" : "hostname");
      const username = str(row, source === "json" ? "username" : "username");
      const createdAt = str(row, source === "json" ? "createdAt" : "created_at");

      // Check for duplicate
      const exists = checkStmt.get({ command, hostname, username, created_at: createdAt });
      if (exists && exists.c > 0) {
        skipped++;
        continue;
      }

      insertStmt.run({
        command,
        project: nullStr(row, source === "json" ? "project" : "project"),
        duration_ns: num(row, source === "json" ? "durationNs" : "duration_ns"),
        exit_code: num(row, source === "json" ? "exitCode" : "exit_code"),
        cpu_user_us: nullNum(row, source === "json" ? "cpuUserUs" : "cpu_user_us"),
        cpu_system_us: nullNum(row, source === "json" ? "cpuSystemUs" : "cpu_system_us"),
        max_rss: nullNum(row, source === "json" ? "maxRss" : "max_rss"),
        os: str(row, source === "json" ? "os" : "os"),
        cpu_model: str(row, source === "json" ? "cpuModel" : "cpu_model"),
        cpu_cores: num(row, source === "json" ? "cpuCores" : "cpu_cores"),
        ram_bytes: num(row, source === "json" ? "ramBytes" : "ram_bytes"),
        hostname,
        username,
        cwd: str(row, source === "json" ? "cwd" : "cwd"),
        shell: nullStr(row, source === "json" ? "shell" : "shell"),
        bun_version: str(row, source === "json" ? "bunVersion" : "bun_version"),
        bench_group: nullStr(row, source === "json" ? "benchGroup" : "bench_group"),
        created_at: createdAt,
      });
      imported++;
    }
  });

  runImport();

  return { file: filePath, imported, skipped };
}

function str(row: Record<string, unknown>, key: string): string {
  return String(row[key] ?? "");
}

function nullStr(row: Record<string, unknown>, key: string): string | null {
  const val = row[key];
  if (val === null || val === undefined || val === "") return null;
  return String(val);
}

function num(row: Record<string, unknown>, key: string): number {
  return Number(row[key]) || 0;
}

function nullNum(row: Record<string, unknown>, key: string): number | null {
  const val = row[key];
  if (val === null || val === undefined || val === "") return null;
  return Number(val);
}
