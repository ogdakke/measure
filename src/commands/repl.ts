import * as readline from "node:readline";
import type { Database } from "bun:sqlite";
import { executeCommand } from "../runner/execute.ts";
import { insertMeasurement } from "../db/queries.ts";
import { getSystemInfo } from "../system/metadata.ts";
import { detectProject } from "../system/project.ts";
import { formatSummary } from "./shared.ts";
import { historyCommand } from "./history.ts";
import { statsCommand } from "./stats.ts";
import { exportCommand } from "./export.ts";
import { systemCommand } from "./system.ts";
import { join } from "node:path";
import { bold, dim, cyan } from "../format/colors.ts";

export async function startRepl(
  db: Database,
  username: string,
): Promise<void> {
  const system = getSystemInfo(username);
  const project = detectProject(process.cwd());

  const version =
    (
      await Bun.file(
        new URL("../../package.json", import.meta.url).pathname,
      ).json()
    ).version ?? "0.1.0";

  console.log();
  console.log(
    `  ${bold("measure")} v${version} ${dim("|")} project: ${cyan(project ?? "unknown")} ${dim("|")} host: ${cyan(system.hostname)} ${dim("|")} user: ${cyan(username)}`,
  );
  console.log(`  Type a command to measure, or ${dim(".help")} for options.`);
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

    if (input.startsWith(".")) {
      handleDotCommand(db, username, input);
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

function handleDotCommand(
  db: Database,
  username: string,
  input: string,
): void {
  const [cmd, ...args] = input.split(/\s+/);

  switch (cmd) {
    case ".help":
      console.log();
      console.log(`  ${bold("REPL Commands:")}`);
      console.log(`  ${dim(".history [N]")}     Show last N measurements (default 10)`);
      console.log(`  ${dim(".stats")}           Show aggregated stats`);
      console.log(`  ${dim(".export [csv|json] [file]")} Export to file (defaults to ./measure-export.csv)`);
      console.log(`  ${dim(".system")}          Show system info`);
      console.log(`  ${dim(".clear")}           Clear screen`);
      console.log(`  ${dim(".exit / .quit")}    Exit`);
      console.log();
      break;

    case ".history": {
      const limit = parseInt(args[0] ?? "10", 10) || 10;
      historyCommand(db, limit);
      break;
    }

    case ".stats":
      statsCommand(db);
      break;

    case ".export": {
      const format = (args[0] === "json" ? "json" : "csv") as "csv" | "json";
      const filename = args[1] ?? defaultExportPath(format);
      exportCommand(db, format, undefined, undefined, undefined, filename);
      break;
    }

    case ".system":
      systemCommand(username);
      break;

    case ".clear":
      console.clear();
      break;

    case ".exit":
    case ".quit":
      process.exit(0);
      break;

    default:
      console.log(dim(`  Unknown command: ${cmd}. Type .help for options.`));
      break;
  }
}

function defaultExportPath(format: "csv" | "json"): string {
  const date = new Date().toISOString().slice(0, 10);
  return join(process.cwd(), `measure-export-${date}.${format}`);
}
