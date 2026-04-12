#!/usr/bin/env bun

import { parseArgs, extractDbFlag } from "./cli.ts";
import { benchCommand } from "./commands/bench.ts";
import { dbListCommand, dbCreateCommand, dbUseCommand } from "./commands/db.ts";
import { exportCommand } from "./commands/export.ts";
import { historyCommand } from "./commands/history.ts";
import { importCommand } from "./commands/import.ts";
import { runCommand } from "./commands/run.ts";
import { statsCommand } from "./commands/stats.ts";
import { systemCommand } from "./commands/system.ts";
import { getDatabase } from "./db/connection.ts";
import { bold, dim, red, green, yellow, cyan } from "./format/colors.ts";
import { formatDuration, formatBytes, formatMicroseconds } from "./format/units.ts";
import { renderTable, type Column } from "./format/table.ts";
import { formatReplSlashCommandHelpLines } from "./repl/slash-commands.ts";
import { ensureUsername } from "./system/username.ts";

// Extract --db flag before parsing commands
const { dbName, argv: cleanedArgv } = extractDbFlag(process.argv);

const parsed = parseArgs(cleanedArgv);
if (parsed.isErr()) {
  console.error(red(`  Error: ${parsed.error.message}`));
  process.exit(1);
}

const cmd = parsed.value;

if (cmd.command === "help") {
  printHelp();
  process.exit(0);
}

if (cmd.command === "version") {
  const pkg = await Bun.file(new URL("../package.json", import.meta.url).pathname).json();
  console.log(`measure v${pkg.version}`);
  process.exit(0);
}

// db list doesn't need a database connection
if (cmd.command === "db" && cmd.action === "list") {
  const dbs = dbListCommand();
  console.log();
  console.log(`  ${bold("Databases:")}`);
  for (const db of dbs) {
    const marker = db.active ? green(" (active)") : "";
    console.log(`    ${cyan(db.name)}${marker}  ${dim(db.path)}`);
  }
  console.log();
  process.exit(0);
}

// db create/use don't need the full DB open flow
if (cmd.command === "db") {
  if (cmd.action === "create") {
    const result = dbCreateCommand(cmd.name);
    if (result.isErr()) {
      console.error(red(`  Error: ${result.error.message}`));
      process.exit(1);
    }
    console.log(`  Created database ${cyan(result.value.name)} at ${dim(result.value.path)}`);
  } else {
    const result = dbUseCommand(cmd.name);
    if (result.isErr()) {
      console.error(red(`  Error: ${result.error.message}`));
      process.exit(1);
    }
    console.log(`  Switched to database ${cyan(result.value.name)}`);
  }
  process.exit(0);
}

// All other commands need the database
const dbResult = getDatabase(dbName);
if (dbResult.isErr()) {
  console.error(red(`  Error: ${dbResult.error.message}`));
  process.exit(1);
}
const db = dbResult.value;

// Import doesn't need username
if (cmd.command === "import") {
  const result = importCommand(db, cmd.files);
  if (result.isErr()) {
    console.error(red(`  Error: ${result.error.message}`));
    process.exit(1);
  }
  const results = result.value;
  const totalImported = results.reduce((s, r) => s + r.imported, 0);
  const totalSkipped = results.reduce((s, r) => s + r.skipped, 0);
  console.log();
  for (const r of results) {
    const skipNote = r.skipped > 0 ? ` ${dim(`(${r.skipped} duplicates skipped)`)}` : "";
    console.log(
      `  ${green("+")} ${cyan(require("node:path").basename(r.file))}: ${r.imported} measurements imported${skipNote}`,
    );
  }
  console.log();
  console.log(
    `  ${bold("Total:")} ${totalImported} imported from ${results.length} file${results.length === 1 ? "" : "s"}${totalSkipped > 0 ? ` ${dim(`(${totalSkipped} skipped as duplicates)`)}` : ""}`,
  );
  console.log();
  process.exit(0);
}

// Only commands that record measurements need the username
const needsUsername = cmd.command === "repl" || cmd.command === "run" || cmd.command === "bench";
const username = needsUsername ? await ensureUsername(db) : "";

switch (cmd.command) {
  case "repl": {
    if (!process.stdin.isTTY) {
      console.error(red("  Error: REPL requires an interactive terminal (TTY)."));
      process.exit(1);
    }
    // Dynamic import to keep one-shot commands fast (React/Ink only loaded for REPL)
    const { render } = await import("ink");
    const { Repl } = await import("./ui/Repl.tsx");
    const { createElement } = await import("react");
    const instance = render(createElement(Repl, { db, username }), {
      exitOnCtrlC: true,
      patchConsole: true,
    });
    await instance.waitUntilExit();
    break;
  }

  case "run": {
    const result = await runCommand(db, cmd.args, username);
    if (result.isErr()) {
      console.error(red(`  Error: ${result.error.message}`));
      process.exit(1);
    }
    console.log();
    console.log(formatSummary(result.value));
    process.exit(result.value.exitCode);
    break;
  }

  case "bench": {
    const result = await benchCommand(
      db,
      cmd.iterations,
      cmd.warmup,
      cmd.args,
      username,
      (event) => {
        if (event.type === "warmup") {
          console.log(dim(`  Warmup ${event.index + 1}/${event.total}...`));
        } else {
          const ok = event.exitCode === 0;
          console.log(
            dim(`  Run ${event.index + 1}/${event.total}: `) +
              `${formatDuration(event.durationNs)} ${ok ? green("✓") : yellow(`exit: ${event.exitCode}`)}`,
          );
        }
      },
    );
    if (result.isErr()) {
      console.error(red(`  Error: ${result.error.message}`));
      process.exit(1);
    }
    const { stats, command, iterations, warmup } = result.value;
    console.log();
    console.log(
      `  ${bold("Benchmark:")} ${cyan(command)} ${dim(`(${iterations} runs${warmup > 0 ? `, ${warmup} warmup` : ""})`)}`,
    );
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
    break;
  }

  case "history": {
    const result = historyCommand(db, cmd.limit, cmd.project, cmd.commandFilter);
    if (result.isErr()) {
      console.error(red(`  Error: ${result.error.message}`));
      process.exit(1);
    }
    const rows = result.value;
    if (rows.length === 0) {
      console.log(dim("\n  No measurements found.\n"));
      break;
    }
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
      exit: m.exitCode === 0 ? green(String(m.exitCode)) : red(String(m.exitCode)),
      project: m.project ?? dim("—"),
      host: m.hostname,
      date: formatDate(m.createdAt),
    }));
    console.log();
    console.log(renderTable(columns, tableRows));
    console.log();
    break;
  }

  case "stats": {
    const result = statsCommand(db, cmd.project, cmd.commandFilter, cmd.host);
    if (result.isErr()) {
      console.error(red(`  Error: ${result.error.message}`));
      process.exit(1);
    }
    const stats = result.value;
    if (stats.length === 0) {
      console.log(dim("\n  No measurements found.\n"));
      break;
    }
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
    console.log(`  ${bold("Aggregated Stats")}${cmd.project ? ` — project: ${cmd.project}` : ""}`);
    console.log();
    console.log(renderTable(columns, tableRows));
    console.log();
    break;
  }

  case "export": {
    const result = exportCommand(
      db,
      cmd.format,
      cmd.project,
      cmd.commandFilter,
      cmd.host,
      cmd.output,
    );
    if (result.isErr()) {
      console.error(red(`  Error: ${result.error.message}`));
      process.exit(1);
    }
    if (result.value.path) {
      console.log(`  Exported ${result.value.count} measurements to ${result.value.path}`);
    }
    break;
  }

  case "system": {
    const sys = systemCommand(username);
    console.log();
    console.log(`  ${bold("System Info")}`);
    console.log(`  ${dim("OS:      ")} ${sys.os}`);
    console.log(`  ${dim("CPU:     ")} ${sys.cpuModel}`);
    console.log(`  ${dim("Cores:   ")} ${sys.cpuCores}`);
    console.log(`  ${dim("RAM:     ")} ${formatBytes(sys.ramBytes)}`);
    console.log(`  ${dim("Host:    ")} ${sys.hostname}`);
    console.log(`  ${dim("User:    ")} ${sys.username}`);
    console.log(`  ${dim("Shell:   ")} ${sys.shell ?? "unknown"}`);
    console.log(`  ${dim("Bun:     ")} ${sys.bunVersion}`);
    console.log();
    break;
  }
}

function formatSummary(m: {
  exitCode: number;
  durationNs: number;
  cpuUserUs: number | null;
  cpuSystemUs: number | null;
  maxRss: number | null;
}): string {
  const ok = m.exitCode === 0;
  const icon = ok ? green("✓") : red("✗");
  const s = m.durationNs / 1_000_000_000;
  const duration =
    s < 5
      ? green(formatDuration(m.durationNs))
      : s < 30
        ? yellow(formatDuration(m.durationNs))
        : red(formatDuration(m.durationNs));
  const parts = [`  ${icon} ${bold(duration)}`];
  if (m.cpuUserUs != null && m.cpuSystemUs != null) {
    parts.push(
      `cpu: ${formatMicroseconds(m.cpuUserUs)} user, ${formatMicroseconds(m.cpuSystemUs)} sys`,
    );
  }
  if (m.maxRss != null) {
    parts.push(`mem: ${formatBytes(m.maxRss)}`);
  }
  parts.push(`exit: ${ok ? dim(String(m.exitCode)) : red(String(m.exitCode))}`);
  return parts.join(dim(" | "));
}

function formatDate(iso: string): string {
  const d = new Date(iso + "Z");
  const month = d.toLocaleString("en", { month: "short" });
  const day = d.getDate();
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${month} ${day} ${h}:${m}`;
}

function printHelp(): void {
  console.log(`
  ${bold("measure")} — Measure and compare command execution times

  ${bold("Usage:")}
    measure                                           Start REPL
    measure run <command...>                          One-shot measurement
    measure bench [-n count] [--warmup N] <cmd...>    Benchmark N iterations
    measure history [--limit N] [--project P]         Recent measurements
    measure stats [--project P] [--host H]            Aggregated stats
    measure export [--format csv|json] [-o file]      Export data
    measure import <files...>                         Import .db/.csv/.json files
    measure db list                                   List databases
    measure db create <name>                          Create a new database
    measure db use <name>                             Switch active database
    measure system                                    Show system info

  ${bold("Options:")}
    --help, -h                                        Show this help
    --version, -v                                     Show version
    --db <name>                                       Use a specific database for this command

  ${bold("REPL Commands:")}
${formatReplSlashCommandHelpLines().join("\n")}
    Slash menu: type / to browse, Up/Down to select, Enter to run,
                Tab to prefill commands that take input
    Editing: arrows/home/end, Ctrl+A/E/B/F/D/W/U/K/L, Ctrl+P/N history,
             Alt/Option+B/F/D, Alt/Option+Backspace/Delete, Ctrl/Alt+Left/Right

  ${dim("Data stored at ~/.measure/ (use 'measure db list' to see databases)")}
`);
}
