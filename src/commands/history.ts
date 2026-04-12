import { Result } from "better-result";
import type { Database } from "bun:sqlite";
import { getHistory } from "../db/queries.ts";
import { renderTable, type Column } from "../format/table.ts";
import { formatDuration } from "../format/units.ts";
import { green, red, dim } from "../format/colors.ts";
import type { DatabaseError } from "../errors.ts";

export function historyCommand(
  db: Database,
  limit: number,
  project?: string,
  commandFilter?: string,
): Result<void, DatabaseError> {
  const result = getHistory(db, {
    limit,
    project,
    command: commandFilter,
  });
  if (result.isErr()) return result;

  const rows = result.value;

  const columns: Column[] = [
    { key: "id", label: "#", align: "right" },
    { key: "command", label: "Command", maxWidth: 40 },
    { key: "duration", label: "Duration", align: "right" },
    { key: "exit", label: "Exit", align: "right" },
    { key: "project", label: "Project", maxWidth: 20 },
    { key: "host", label: "Host", maxWidth: 16 },
    { key: "date", label: "Date" },
  ];

  const tableRows = rows.map((m) => ({
    id: String(m.id),
    command: m.command,
    duration: formatDuration(m.durationNs),
    exit:
      m.exitCode === 0
        ? green(String(m.exitCode))
        : red(String(m.exitCode)),
    project: m.project ?? dim("—"),
    host: m.hostname,
    date: formatDate(m.createdAt),
  }));

  console.log();
  console.log(renderTable(columns, tableRows));
  console.log();

  return Result.ok(undefined);
}

function formatDate(iso: string): string {
  const d = new Date(iso + "Z");
  const month = d.toLocaleString("en", { month: "short" });
  const day = d.getDate();
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${month} ${day} ${h}:${m}`;
}
