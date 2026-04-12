import React from "react";
import { describe, expect, test } from "bun:test";
import { renderToString } from "ink";
import { HistoryView } from "../../src/ui/HistoryView.tsx";
import { StatsView } from "../../src/ui/StatsView.tsx";
import type { AggregateStats, Measurement } from "../../src/types.ts";

function stripAnsi(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/\x1b\[[0-9;]*m/g, "");
}

function withStdoutColumns<T>(columns: number, run: () => T): T {
  const descriptor = Object.getOwnPropertyDescriptor(process.stdout, "columns");
  Object.defineProperty(process.stdout, "columns", {
    value: columns,
    configurable: true,
  });

  try {
    return run();
  } finally {
    if (descriptor) {
      Object.defineProperty(process.stdout, "columns", descriptor);
    }
  }
}

function sampleMeasurement(overrides: Partial<Measurement> = {}): Measurement {
  return {
    id: 1,
    command: "echo hi",
    project: "measure",
    durationNs: 1_234_000_000,
    exitCode: 0,
    cpuUserUs: null,
    cpuSystemUs: null,
    maxRss: null,
    os: "macOS",
    cpuModel: "M4",
    cpuCores: 10,
    ramBytes: 32_000_000_000,
    hostname: "daniels-mbp",
    username: "daniel",
    cwd: "/tmp",
    shell: "/bin/zsh",
    bunVersion: "1.3.12",
    benchGroup: null,
    createdAt: "2026-04-12T10:20:30",
    ...overrides,
  };
}

describe("REPL views", () => {
  test("HistoryView keeps a single row on narrower terminals", () => {
    const output = withStdoutColumns(80, () =>
      renderToString(<HistoryView rows={[sampleMeasurement()]} />, { columns: 80 }),
    );

    const lines = stripAnsi(output).trim().split("\n");

    expect(lines).toHaveLength(3);
    expect(lines[2]).toContain("daniels-mbp");
    expect(lines[2]).toContain("Apr 12");
    expect(lines.some((line) => line.trim().endsWith(":20"))).toBe(true);
  });

  test("StatsView renders a single stats row without wrapping", () => {
    const stats: AggregateStats[] = [
      {
        command: "bun test",
        hostname: "daniels-mbp",
        os: "macOS",
        cpuModel: "M4 Pro",
        count: 12,
        meanNs: 1_200_000_000,
        medianNs: 1_100_000_000,
        minNs: 900_000_000,
        maxNs: 1_500_000_000,
        stddevNs: 100_000_000,
        successRate: 1,
      },
    ];

    const output = withStdoutColumns(120, () =>
      renderToString(<StatsView stats={stats} />, { columns: 120 }),
    );

    const lines = stripAnsi(output).trim().split("\n");

    expect(lines).toHaveLength(4);
    expect(lines[3]).toContain("bun test");
    expect(lines[3]).toContain("M4 Pro");
    expect(lines[3]).toContain("1.20s");
  });
});
