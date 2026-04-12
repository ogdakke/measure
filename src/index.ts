#!/usr/bin/env bun

import { parseArgs } from "./cli.ts";
import { getDatabase } from "./db/connection.ts";
import { ensureUsername } from "./system/username.ts";
import { runCommand } from "./commands/run.ts";
import { benchCommand } from "./commands/bench.ts";
import { startRepl } from "./commands/repl.ts";
import { historyCommand } from "./commands/history.ts";
import { statsCommand } from "./commands/stats.ts";
import { exportCommand } from "./commands/export.ts";
import { systemCommand } from "./commands/system.ts";
import { bold, dim, red } from "./format/colors.ts";

const parsed = parseArgs(process.argv);
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
  const pkg = await Bun.file(
    new URL("../package.json", import.meta.url).pathname,
  ).json();
  console.log(`measure v${pkg.version}`);
  process.exit(0);
}

// All other commands need the database
const dbResult = getDatabase();
if (dbResult.isErr()) {
  console.error(red(`  Error: ${dbResult.error.message}`));
  process.exit(1);
}
const db = dbResult.value;

// Ensure username is set (prompts on first run)
const username = await ensureUsername(db);

switch (cmd.command) {
  case "repl":
    await startRepl(db, username);
    break;

  case "run": {
    const result = await runCommand(db, cmd.args, username);
    if (result.isErr()) {
      console.error(red(`  Error: ${result.error.message}`));
      process.exit(1);
    }
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
    );
    if (result.isErr()) {
      console.error(red(`  Error: ${result.error.message}`));
      process.exit(1);
    }
    break;
  }

  case "history": {
    const result = historyCommand(
      db,
      cmd.limit,
      cmd.project,
      cmd.commandFilter,
    );
    if (result.isErr()) {
      console.error(red(`  Error: ${result.error.message}`));
      process.exit(1);
    }
    break;
  }

  case "stats": {
    const result = statsCommand(
      db,
      cmd.project,
      cmd.commandFilter,
      cmd.host,
    );
    if (result.isErr()) {
      console.error(red(`  Error: ${result.error.message}`));
      process.exit(1);
    }
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
    break;
  }

  case "system":
    systemCommand(username);
    break;
}

function printHelp(): void {
  console.log(`
  ${bold("measure")} — Measure and compare command execution times

  ${bold("Usage:")}
    measure                                          Start REPL
    measure run <command...>                          One-shot measurement
    measure bench [-n count] [--warmup N] <cmd...>   Benchmark N iterations
    measure history [--limit N] [--project P]         Recent measurements
    measure stats [--project P] [--host H]            Aggregated stats
    measure export [--format csv|json] [-o file]      Export data
    measure system                                    Show system info

  ${bold("Options:")}
    --help, -h       Show this help
    --version, -v    Show version

  ${bold("REPL Commands:")}
    .history [N]     Show last N measurements
    .stats           Show aggregated stats
    .export [csv|json] [file] Export to file
    .system          Show system info
    .clear           Clear screen
    .exit / .quit    Exit

  ${dim("Data stored at ~/.measure/measure.db")}
`);
}
