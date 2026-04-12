import { Result } from "better-result";
import type { Database } from "bun:sqlite";
import { executeCommand } from "../runner/execute.ts";
import { insertMeasurement } from "../db/queries.ts";
import { getSystemInfo } from "../system/metadata.ts";
import { detectProject } from "../system/project.ts";
import { formatSummary } from "./shared.ts";
import { bold, dim, cyan, green, yellow } from "../format/colors.ts";
import { formatDuration } from "../format/units.ts";
import type { CommandError, DatabaseError } from "../errors.ts";
import type { BenchStats } from "../types.ts";

export async function benchCommand(
  db: Database,
  iterations: number,
  warmup: number,
  args: string[],
  username: string,
): Promise<Result<BenchStats, CommandError | DatabaseError>> {
  const command = args.join(" ");
  const system = getSystemInfo(username);
  const project = detectProject(process.cwd());
  const benchGroup = crypto.randomUUID();

  console.log();
  console.log(
    `  ${bold("Benchmark:")} ${cyan(command)} ${dim(`(${iterations} runs${warmup > 0 ? `, ${warmup} warmup` : ""})`)}`,
  );
  console.log();

  // Warmup runs
  for (let i = 0; i < warmup; i++) {
    console.log(dim(`  Warmup ${i + 1}/${warmup}...`));
    const result = await executeCommand(command);
    if (result.isErr()) return result;
  }

  // Measured runs
  const durations: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const result = await executeCommand(command);
    if (result.isErr()) return result;

    const execution = result.value;
    durations.push(execution.durationNs);

    const saved = insertMeasurement(db, {
      command,
      project,
      execution,
      system,
      cwd: process.cwd(),
      benchGroup,
    });
    if (saved.isErr()) return saved;

    const ok = execution.exitCode === 0;
    console.log(
      dim(`  Run ${i + 1}/${iterations}: `) +
        `${formatDuration(execution.durationNs)} ${ok ? green("✓") : yellow(`exit: ${execution.exitCode}`)}`,
    );
  }

  const stats = computeStats(durations);

  console.log();
  console.log(`  ${bold("Results:")}`);
  console.log(`  ${dim("Mean:  ")} ${formatDuration(stats.mean)}`);
  console.log(`  ${dim("Median:")} ${formatDuration(stats.median)}`);
  console.log(`  ${dim("Min:   ")} ${formatDuration(stats.min)}`);
  console.log(`  ${dim("Max:   ")} ${formatDuration(stats.max)}`);
  console.log(`  ${dim("StdDev:")} ${formatDuration(stats.stddev)}`);
  if (iterations >= 10) {
    console.log(`  ${dim("P5:    ")} ${formatDuration(stats.p5)}`);
    console.log(`  ${dim("P95:   ")} ${formatDuration(stats.p95)}`);
  }
  console.log();

  return Result.ok(stats);
}

function computeStats(values: number[]): BenchStats {
  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / count;

  const median =
    count % 2 === 0
      ? (sorted[count / 2 - 1]! + sorted[count / 2]!) / 2
      : sorted[Math.floor(count / 2)]!;

  const variance =
    sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) / count;
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
