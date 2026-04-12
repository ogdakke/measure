import { Result } from "better-result";
import { ParseError } from "./errors.ts";
import type { ParsedCommand } from "./types.ts";

export function parseArgs(
  argv: string[],
): Result<ParsedCommand, ParseError> {
  const args = argv.slice(2);

  if (args.length === 0) return Result.ok({ command: "repl" });

  const sub = args[0]!;

  if (sub === "--help" || sub === "-h") return Result.ok({ command: "help" });
  if (sub === "--version" || sub === "-v")
    return Result.ok({ command: "version" });

  switch (sub) {
    case "run":
      return parseRun(args.slice(1));
    case "bench":
      return parseBench(args.slice(1));
    case "history":
      return parseHistory(args.slice(1));
    case "stats":
      return parseStats(args.slice(1));
    case "export":
      return parseExport(args.slice(1));
    case "system":
      return Result.ok({ command: "system" });
    case "db":
      return parseDb(args.slice(1));
    case "import":
      return parseImport(args.slice(1));
    default:
      return Result.err(
        new ParseError({
          message: `Unknown command: ${sub}. Run 'measure --help' for usage.`,
        }),
      );
  }
}

function parseRun(args: string[]): Result<ParsedCommand, ParseError> {
  if (args.length === 0) {
    return Result.err(
      new ParseError({ message: "Usage: measure run <command...>" }),
    );
  }
  return Result.ok({ command: "run", args });
}

function parseBench(args: string[]): Result<ParsedCommand, ParseError> {
  let iterations = 10;
  let warmup = 0;
  let i = 0;

  while (i < args.length) {
    const arg = args[i]!;
    if (arg === "-n" || arg === "--iterations") {
      const val = args[++i];
      if (!val || isNaN(parseInt(val, 10))) {
        return Result.err(
          new ParseError({ message: `Expected number after ${arg}` }),
        );
      }
      iterations = parseInt(val, 10);
    } else if (arg === "--warmup") {
      const val = args[++i];
      if (!val || isNaN(parseInt(val, 10))) {
        return Result.err(
          new ParseError({ message: "Expected number after --warmup" }),
        );
      }
      warmup = parseInt(val, 10);
    } else {
      break;
    }
    i++;
  }

  const remaining = args.slice(i);
  if (remaining.length === 0) {
    return Result.err(
      new ParseError({
        message: "Usage: measure bench [-n count] [--warmup N] <command...>",
      }),
    );
  }

  return Result.ok({ command: "bench", iterations, warmup, args: remaining });
}

function parseHistory(args: string[]): Result<ParsedCommand, ParseError> {
  let limit = 20;
  let project: string | undefined;
  let commandFilter: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--limit") {
      limit = parseInt(args[++i] ?? "20", 10) || 20;
    } else if (arg === "--project") {
      project = args[++i];
    } else if (arg === "--command") {
      commandFilter = args[++i];
    }
  }

  return Result.ok({ command: "history", limit, project, commandFilter });
}

function parseStats(args: string[]): Result<ParsedCommand, ParseError> {
  let project: string | undefined;
  let commandFilter: string | undefined;
  let host: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--project") project = args[++i];
    else if (arg === "--command") commandFilter = args[++i];
    else if (arg === "--host") host = args[++i];
  }

  return Result.ok({ command: "stats", project, commandFilter, host });
}

function parseExport(args: string[]): Result<ParsedCommand, ParseError> {
  let format: "csv" | "json" = "csv";
  let project: string | undefined;
  let commandFilter: string | undefined;
  let host: string | undefined;
  let output: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--format") {
      const val = args[++i];
      if (val !== "csv" && val !== "json") {
        return Result.err(
          new ParseError({
            message: `Invalid format: ${val}. Use 'csv' or 'json'.`,
          }),
        );
      }
      format = val;
    } else if (arg === "--project") project = args[++i];
    else if (arg === "--command") commandFilter = args[++i];
    else if (arg === "--host") host = args[++i];
    else if (arg === "--output" || arg === "-o") output = args[++i];
  }

  return Result.ok({
    command: "export",
    format,
    project,
    commandFilter,
    host,
    output,
  });
}

function parseDb(args: string[]): Result<ParsedCommand, ParseError> {
  const action = args[0];

  if (!action || action === "list") {
    return Result.ok({ command: "db", action: "list" });
  }

  if (action === "create") {
    const name = args[1];
    if (!name) {
      return Result.err(
        new ParseError({ message: "Usage: measure db create <name>" }),
      );
    }
    if (name === "default") {
      return Result.err(
        new ParseError({ message: "Cannot create a database named 'default' — it already exists." }),
      );
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      return Result.err(
        new ParseError({ message: "Database name must only contain letters, numbers, hyphens, and underscores." }),
      );
    }
    return Result.ok({ command: "db", action: "create", name });
  }

  if (action === "use") {
    const name = args[1];
    if (!name) {
      return Result.err(
        new ParseError({ message: "Usage: measure db use <name>" }),
      );
    }
    return Result.ok({ command: "db", action: "use", name });
  }

  return Result.err(
    new ParseError({
      message: `Unknown db action: ${action}. Use 'list', 'create', or 'use'.`,
    }),
  );
}

function parseImport(args: string[]): Result<ParsedCommand, ParseError> {
  const files = args.filter((a) => !a.startsWith("--"));

  if (files.length === 0) {
    return Result.err(
      new ParseError({
        message: "Usage: measure import <file1.db|.csv|.json> [file2...]\nSupported formats: .db (SQLite), .csv, .json",
      }),
    );
  }

  for (const file of files) {
    if (!file.endsWith(".db") && !file.endsWith(".csv") && !file.endsWith(".json")) {
      return Result.err(
        new ParseError({
          message: `Unsupported file format: ${file}. Use .db, .csv, or .json files.`,
        }),
      );
    }
  }

  return Result.ok({ command: "import", files });
}

/**
 * Extract --db <name> from raw argv, returning the name and cleaned argv.
 * This is called before parseArgs so the --db flag doesn't interfere with command parsing.
 */
export function extractDbFlag(argv: string[]): { dbName?: string; argv: string[] } {
  const idx = argv.indexOf("--db");
  if (idx === -1 || idx >= argv.length - 1) {
    return { argv };
  }
  const dbName = argv[idx + 1]!;
  const cleaned = [...argv.slice(0, idx), ...argv.slice(idx + 2)];
  return { dbName, argv: cleaned };
}
