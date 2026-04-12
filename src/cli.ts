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
