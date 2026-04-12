#!/usr/bin/env bun

import { parseArgs, extractDbFlag } from "./cli.ts";
import { benchCommand } from "./commands/bench.ts";
import { dbListCommand, dbCreateCommand, dbUseCommand } from "./commands/db.ts";
import { exportCommand } from "./commands/export.ts";
import { historyCommand } from "./commands/history.ts";
import { importCommand } from "./commands/import.ts";
import { startRepl } from "./commands/repl.ts";
import { runCommand } from "./commands/run.ts";
import { statsCommand } from "./commands/stats.ts";
import { systemCommand } from "./commands/system.ts";
import { getDatabase } from "./db/connection.ts";
import { bold, dim, red } from "./format/colors.ts";
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
  const pkg = await Bun.file(
    new URL("../package.json", import.meta.url).pathname,
  ).json();
  console.log(`measure v${pkg.version}`);
  process.exit(0);
}

// db list doesn't need a database connection
if (cmd.command === "db" && cmd.action === "list") {
  dbListCommand();
  process.exit(0);
}

// db create/use don't need the full DB open flow
if (cmd.command === "db") {
  let result;
  if (cmd.action === "create") {
    result = dbCreateCommand(cmd.name);
  } else {
    result = dbUseCommand(cmd.name);
  }
  if (result.isErr()) {
    console.error(red(`  Error: ${result.error.message}`));
    process.exit(1);
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
  process.exit(0);
}

// Only commands that record measurements need the username
const needsUsername = cmd.command === "repl" || cmd.command === "run" || cmd.command === "bench";
const username = needsUsername ? await ensureUsername(db) : "";

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
    const result = statsCommand(db, cmd.project, cmd.commandFilter, cmd.host);
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
    .history [N]                                      Show last N measurements
    .stats                                            Show aggregated stats
    .export [csv|json] [file]                         Export to file
    .import <files...>                                Import data files
    .db [list|create|use] [name]                      Manage databases
    .system                                           Show system info
    .clear                                            Clear screen
    .exit / .quit                                     Exit

  ${dim("Data stored at ~/.measure/ (use 'measure db list' to see databases)")}
`);
}
