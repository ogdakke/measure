import { Result } from "better-result";
import type { Database } from "bun:sqlite";
import { getStatsData } from "../db/queries.ts";
import { renderTable, type Column } from "../format/table.ts";
import { formatDuration } from "../format/units.ts";
import { bold, dim } from "../format/colors.ts";
import type { DatabaseError } from "../errors.ts";
import type { AggregateStats, Measurement } from "../types.ts";

export function statsCommand(
  db: Database,
  project?: string,
  commandFilter?: string,
  host?: string,
): Result<void, DatabaseError> {
  const result = getStatsData(db, {
    project,
    command: commandFilter,
    host,
  });
  if (result.isErr()) return result;

  const measurements = result.value;
  if (measurements.length === 0) {
    console.log(dim("\n  No measurements found.\n"));
    return Result.ok(undefined);
  }

  const stats = aggregate(measurements);

  const columns: Column[] = [
    { key: "command", label: "Command", maxWidth: 30 },
    { key: "host", label: "Host", maxWidth: 16 },
    { key: "os", label: "OS" },
    { key: "cpu", label: "CPU", maxWidth: 24 },
    { key: "count", label: "Runs", align: "right" },
    { key: "mean", label: "Mean", align: "right" },
    { key: "median", label: "Median", align: "right" },
    { key: "min", label: "Min", align: "right" },
    { key: "max", label: "Max", align: "right" },
    { key: "rate", label: "Pass %", align: "right" },
  ];

  const tableRows = stats.map((s) => ({
    command: s.command,
    host: s.hostname,
    os: s.os,
    cpu: s.cpuModel,
    count: String(s.count),
    mean: formatDuration(s.meanNs),
    median: formatDuration(s.medianNs),
    min: formatDuration(s.minNs),
    max: formatDuration(s.maxNs),
    rate: `${(s.successRate * 100).toFixed(0)}%`,
  }));

  console.log();
  console.log(`  ${bold("Aggregated Stats")}${project ? ` — project: ${project}` : ""}`);
  console.log();
  console.log(renderTable(columns, tableRows));
  console.log();

  return Result.ok(undefined);
}

function aggregate(measurements: Measurement[]): AggregateStats[] {
  const groups = new Map<string, Measurement[]>();

  for (const m of measurements) {
    const key = `${m.command}|||${m.hostname}`;
    const group = groups.get(key);
    if (group) {
      group.push(m);
    } else {
      groups.set(key, [m]);
    }
  }

  const results: AggregateStats[] = [];
  for (const [, group] of groups) {
    const first = group[0]!;
    const durations = group.map((m) => m.durationNs).sort((a, b) => a - b);
    const count = durations.length;
    const sum = durations.reduce((a, b) => a + b, 0);
    const mean = sum / count;
    const median =
      count % 2 === 0
        ? (durations[count / 2 - 1]! + durations[count / 2]!) / 2
        : durations[Math.floor(count / 2)]!;
    const variance =
      durations.reduce((acc, v) => acc + (v - mean) ** 2, 0) / count;
    const successes = group.filter((m) => m.exitCode === 0).length;

    results.push({
      command: first.command,
      hostname: first.hostname,
      os: first.os,
      cpuModel: first.cpuModel,
      count,
      meanNs: mean,
      medianNs: median,
      minNs: durations[0]!,
      maxNs: durations[count - 1]!,
      stddevNs: Math.sqrt(variance),
      successRate: successes / count,
    });
  }

  return results;
}
