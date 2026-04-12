import * as readline from "node:readline";
import type { Database } from "bun:sqlite";
import { executeCommand } from "../runner/execute.ts";
import { insertMeasurement } from "../db/queries.ts";
import { getSystemInfo } from "../system/metadata.ts";
import { detectProject } from "../system/project.ts";
import { historyCommand } from "./history.ts";
import { statsCommand } from "./stats.ts";
import { exportCommand } from "./export.ts";
import { importCommand } from "./import.ts";
import { dbListCommand, dbCreateCommand, dbUseCommand } from "./db.ts";
import { systemCommand } from "./system.ts";
import { join } from "node:path";
import { bold, dim, cyan, green, red, yellow } from "../format/colors.ts";
import { formatDuration, formatBytes, formatMicroseconds } from "../format/units.ts";
import { renderTable, type Column } from "../format/table.ts";
import type { ExecutionResult } from "../types.ts";
import { formatReplSlashCommandHelpLines, parseReplSlashCommand } from "../repl/slash-commands.ts";

export async function startRepl(db: Database, username: string): Promise<void> {
  const system = getSystemInfo(username);
  const project = detectProject(process.cwd());

  const version =
    (await Bun.file(new URL("../../package.json", import.meta.url).pathname).json()).version ??
    "0.1.0";

  console.log();
  console.log(
    `  ${bold("measure")} v${version} ${dim("|")} project: ${cyan(project ?? "unknown")} ${dim("|")} host: ${cyan(system.hostname)} ${dim("|")} user: ${cyan(username)}`,
  );
  console.log(`  Type a command to measure, or ${dim("/help")} for options.`);
  console.log();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${dim("measure")} > `,
  });

  rl.prompt();

  rl.on("line", async (line) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }

    if (input.startsWith("/")) {
      handleSlashCommand(db, username, input);
      rl.prompt();
      return;
    }

    // Execute and measure the command
    const result = await executeCommand(input);
    if (result.isErr()) {
      console.error(`  Error: ${result.error.message}`);
      rl.prompt();
      return;
    }

    const execution = result.value;
    const saved = insertMeasurement(db, {
      command: input,
      project,
      execution,
      system,
      cwd: process.cwd(),
      benchGroup: null,
    });

    if (saved.isErr()) {
      console.error(`  Error: ${saved.error.message}`);
    }

    console.log();
    console.log(formatSummary(execution));
    console.log();
    rl.prompt();
  });

  rl.on("close", () => {
    console.log();
  });

  return new Promise((resolve) => {
    rl.on("close", resolve);
  });
}

function handleSlashCommand(db: Database, username: string, input: string): void {
  const { command, args } = parseReplSlashCommand(input);

  switch (command?.key) {
    case "help":
      console.log();
      console.log(`  ${bold("REPL Commands:")}`);
      for (const line of formatReplSlashCommandHelpLines()) {
        console.log(dim(line));
      }
      console.log(`  ${dim("Slash menu:")} type / to browse, Up/Down to select, Enter to run,`);
      console.log(`              Tab to prefill commands that take input`);
      console.log(`  ${dim("Editing:")} arrows/home/end, Ctrl+A/E/B/F/D/W/U/K, Ctrl+P/N history`);
      console.log(`           Alt/Option+B/F/D, Alt/Option+Backspace/Delete, Ctrl/Alt+Left/Right`);
      console.log();
      break;

    case "history": {
      const limit = parseInt(args[0] ?? "10", 10) || 10;
      const result = historyCommand(db, limit);
      if (result.isErr()) {
        console.error(red(`  Error: ${result.error.message}`));
        break;
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
      const result = statsCommand(db);
      if (result.isErr()) {
        console.error(red(`  Error: ${result.error.message}`));
        break;
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
      console.log(`  ${bold("Aggregated Stats")}`);
      console.log();
      console.log(renderTable(columns, tableRows));
      console.log();
      break;
    }

    case "export": {
      const format = (args[0] === "json" ? "json" : "csv") as "csv" | "json";
      const filename = args[1] ?? defaultExportPath(format);
      const result = exportCommand(db, format, undefined, undefined, undefined, filename);
      if (result.isErr()) {
        console.error(red(`  Error: ${result.error.message}`));
        break;
      }
      if (result.value.path) {
        console.log(`  Exported ${result.value.count} measurements to ${result.value.path}`);
      }
      break;
    }

    case "import": {
      if (args.length === 0) {
        console.log(dim("  Usage: /import <file1.db|.csv|.json> [file2...]"));
        break;
      }
      const result = importCommand(db, args);
      if (result.isErr()) {
        console.error(red(`  Error: ${result.error.message}`));
        break;
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
      break;
    }

    case "db": {
      const action = args[0] ?? "list";
      if (action === "list") {
        const dbs = dbListCommand();
        console.log();
        console.log(`  ${bold("Databases:")}`);
        for (const d of dbs) {
          const marker = d.active ? green(" (active)") : "";
          console.log(`    ${cyan(d.name)}${marker}  ${dim(d.path)}`);
        }
        console.log();
      } else if (action === "create") {
        if (!args[1]) {
          console.log(dim("  Usage: /db create <name>"));
        } else {
          const result = dbCreateCommand(args[1]);
          if (result.isErr()) {
            console.error(red(`  Error: ${result.error.message}`));
          } else {
            console.log(
              `  Created database ${cyan(result.value.name)} at ${dim(result.value.path)}`,
            );
          }
        }
      } else if (action === "use") {
        if (!args[1]) {
          console.log(dim("  Usage: /db use <name>"));
        } else {
          const result = dbUseCommand(args[1]);
          if (result.isErr()) {
            console.error(red(`  Error: ${result.error.message}`));
          } else {
            console.log(`  Switched to database ${cyan(result.value)}`);
          }
        }
      } else {
        console.log(dim(`  Unknown db action: ${action}. Use list, create, or use.`));
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

    case "clear":
      console.clear();
      break;

    case "exit":
      process.exit(0);
      break;

    default:
      console.log(dim(`  Unknown command: ${input.trim()}. Type /help for options.`));
      break;
  }
}

function defaultExportPath(format: "csv" | "json"): string {
  const date = new Date().toISOString().slice(0, 10);
  return join(process.cwd(), `measure-export-${date}.${format}`);
}

function formatSummary(exec: ExecutionResult): string {
  const ok = exec.exitCode === 0;
  const icon = ok ? green("✓") : red("✗");
  const s = exec.durationNs / 1_000_000_000;
  const duration =
    s < 5
      ? green(formatDuration(exec.durationNs))
      : s < 30
        ? yellow(formatDuration(exec.durationNs))
        : red(formatDuration(exec.durationNs));
  const parts = [`  ${icon} ${bold(duration)}`];
  if (exec.cpuUserUs != null && exec.cpuSystemUs != null) {
    parts.push(
      `cpu: ${formatMicroseconds(exec.cpuUserUs)} user, ${formatMicroseconds(exec.cpuSystemUs)} sys`,
    );
  }
  if (exec.maxRss != null) {
    parts.push(`mem: ${formatBytes(exec.maxRss)}`);
  }
  parts.push(`exit: ${ok ? dim(String(exec.exitCode)) : red(String(exec.exitCode))}`);
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
