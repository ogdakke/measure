import { bold, green, red, yellow, dim } from "../format/colors.ts";
import { formatDuration, formatMicroseconds, formatBytes } from "../format/units.ts";
import type { ExecutionResult } from "../types.ts";

export function formatSummary(exec: ExecutionResult): string {
  const ok = exec.exitCode === 0;
  const icon = ok ? green("✓") : red("✗");
  const duration = colorDuration(exec.durationNs);

  const parts = [
    `  ${icon} ${bold(duration)}`,
  ];

  if (exec.cpuUserUs != null && exec.cpuSystemUs != null) {
    parts.push(`cpu: ${formatMicroseconds(exec.cpuUserUs)} user, ${formatMicroseconds(exec.cpuSystemUs)} sys`);
  }

  if (exec.maxRss != null) {
    parts.push(`mem: ${formatBytes(exec.maxRss)}`);
  }

  parts.push(`exit: ${ok ? dim(String(exec.exitCode)) : red(String(exec.exitCode))}`);

  return parts.join(dim(" | "));
}

function colorDuration(ns: number): string {
  const s = ns / 1_000_000_000;
  const formatted = formatDuration(ns);
  if (s < 5) return green(formatted);
  if (s < 30) return yellow(formatted);
  return red(formatted);
}
