import { Result } from "better-result";
import type { Database } from "bun:sqlite";
import { executeArgs } from "../runner/execute.ts";
import { insertMeasurement } from "../db/queries.ts";
import { getSystemInfo } from "../system/metadata.ts";
import { detectProject } from "../system/project.ts";
import type { CommandError, DatabaseError } from "../errors.ts";
import type { BenchStats } from "../types.ts";

export interface BenchRun {
  durationNs: number;
  exitCode: number;
}

export interface BenchResult {
  command: string;
  iterations: number;
  warmup: number;
  stats: BenchStats;
  runs: BenchRun[];
}

export async function benchCommand(
  db: Database,
  iterations: number,
  warmup: number,
  args: string[],
  username: string,
  onProgress?: (event: BenchProgressEvent) => void,
): Promise<Result<BenchResult, CommandError | DatabaseError>> {
  const command = args.join(" ");
  const system = getSystemInfo(username);
  const project = detectProject(process.cwd());
  const benchGroup = crypto.randomUUID();

  // Warmup runs
  for (let i = 0; i < warmup; i++) {
    onProgress?.({ type: "warmup", index: i, total: warmup });
    const result = await executeArgs(args);
    if (result.isErr()) {
      return Result.err<BenchResult, CommandError | DatabaseError>(result.error);
    }
  }

  // Measured runs
  const runs: BenchRun[] = [];

  for (let i = 0; i < iterations; i++) {
    const result = await executeArgs(args);
    if (result.isErr()) {
      return Result.err<BenchResult, CommandError | DatabaseError>(result.error);
    }

    const execution = result.value;
    runs.push({ durationNs: execution.durationNs, exitCode: execution.exitCode });

    const saved = insertMeasurement(db, {
      command,
      project,
      execution,
      system,
      cwd: process.cwd(),
      benchGroup,
    });
    if (saved.isErr()) {
      return Result.err<BenchResult, CommandError | DatabaseError>(saved.error);
    }

    onProgress?.({
      type: "run",
      index: i,
      total: iterations,
      durationNs: execution.durationNs,
      exitCode: execution.exitCode,
    });
  }

  const stats = computeStats(runs.map((r) => r.durationNs));

  return Result.ok({ command, iterations, warmup, stats, runs });
}

export type BenchProgressEvent =
  | { type: "warmup"; index: number; total: number }
  | { type: "run"; index: number; total: number; durationNs: number; exitCode: number };

export function computeStats(values: number[]): BenchStats {
  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / count;

  const median =
    count % 2 === 0
      ? (sorted[count / 2 - 1]! + sorted[count / 2]!) / 2
      : sorted[Math.floor(count / 2)]!;

  const variance = sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) / count;
  const stddev = Math.sqrt(variance);

  const p5 = sorted[Math.floor(count * 0.05)] ?? sorted[0]!;
  const p95 = sorted[Math.ceil(count * 0.95) - 1] ?? sorted[count - 1]!;

  return {
    count,
    mean,
    median,
    min: sorted[0]!,
    max: sorted[count - 1]!,
    stddev,
    p5,
    p95,
  };
}
