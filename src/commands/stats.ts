import { Result } from "better-result";
import type { Database } from "bun:sqlite";
import { getStatsData } from "../db/queries.ts";
import type { DatabaseError } from "../errors.ts";
import type { AggregateStats, Measurement } from "../types.ts";

export function statsCommand(
  db: Database,
  project?: string,
  commandFilter?: string,
  host?: string,
): Result<AggregateStats[], DatabaseError> {
  const result = getStatsData(db, {
    project,
    command: commandFilter,
    host,
  });
  if (result.isErr()) {
    return Result.err<AggregateStats[], DatabaseError>(result.error);
  }

  return Result.ok(aggregate(result.value));
}

export function aggregate(measurements: Measurement[]): AggregateStats[] {
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
    const variance = durations.reduce((acc, v) => acc + (v - mean) ** 2, 0) / count;
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
