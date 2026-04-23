import { platform } from "node:os";

const SHELL_CONTROL_TOKENS = new Set(["&&", "||", "|", ";", "&", ">", ">>", "<", "2>", "2>>"]);
const POSIX_SHELL_BUILTINS = new Set([
  ".",
  ":",
  "alias",
  "bg",
  "cd",
  "eval",
  "exec",
  "exit",
  "export",
  "fg",
  "jobs",
  "read",
  "set",
  "source",
  "times",
  "trap",
  "ulimit",
  "umask",
  "unalias",
  "unset",
  "wait",
]);
const WINDOWS_SHELL_BUILTINS = new Set([
  "assoc",
  "break",
  "call",
  "cd",
  "chdir",
  "cls",
  "copy",
  "date",
  "del",
  "dir",
  "echo",
  "endlocal",
  "erase",
  "exit",
  "for",
  "ftype",
  "goto",
  "if",
  "md",
  "mkdir",
  "mklink",
  "move",
  "path",
  "pause",
  "popd",
  "prompt",
  "pushd",
  "rd",
  "ren",
  "rename",
  "rmdir",
  "set",
  "setlocal",
  "shift",
  "start",
  "time",
  "title",
  "type",
  "ver",
  "verify",
  "vol",
]);

export function shellCommand(command: string, os: string = platform()): string[] {
  if (os === "win32") {
    // /d disables AutoRun registry commands
    // /s keeps cmd.exe quote handling predictable when Bun quotes this argv item.
    return ["cmd", "/d", "/s", "/c", command];
  }
  return ["sh", "-c", command];
}

export function spawnCommand(command: string, os: string = platform()): string[] {
  if (os === "win32") {
    const args = parseWindowsCommandArgs(command);
    if (args && !shouldUseShellForArgs(args, os)) {
      return args;
    }
  }

  return shellCommand(command, os);
}

/**
 * Reconstruct a command string from a parsed args array, re-quoting arguments
 * that contain spaces or shell metacharacters. This is needed when args have
 * been pre-parsed by the OS shell (e.g. `measure run git commit -m "foo bar"`
 * yields ["git", "commit", "-m", "foo bar"]).
 */
export function buildCommand(args: string[]): string {
  return args.map((arg) => quoteArg(arg, platform())).join(" ");
}

export function shouldUseShellForArgs(args: string[], os: string = platform()): boolean {
  if (args.length === 0) {
    return true;
  }

  if (args.some((arg) => SHELL_CONTROL_TOKENS.has(arg))) {
    return true;
  }

  if (args.length === 1 && /[\s"'`$|&;<>()]/.test(args[0]!)) {
    return true;
  }

  const commandName = args[0]!.toLowerCase();
  const shellBuiltins = os === "win32" ? WINDOWS_SHELL_BUILTINS : POSIX_SHELL_BUILTINS;
  return shellBuiltins.has(commandName);
}

function parseWindowsCommandArgs(command: string): string[] | null {
  const trimmed = command.trim();
  if (!trimmed) {
    return [];
  }

  if (hasWindowsShellSyntax(trimmed)) {
    return null;
  }

  const args: string[] = [];
  let current = "";
  let inQuotes = false;
  let tokenStarted = false;

  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index]!;

    if (char === '"') {
      inQuotes = !inQuotes;
      tokenStarted = true;
      continue;
    }

    if (!inQuotes && /\s/.test(char)) {
      if (tokenStarted) {
        args.push(current);
        current = "";
        tokenStarted = false;
      }
      continue;
    }

    current += char;
    tokenStarted = true;
  }

  if (inQuotes) {
    return null;
  }

  if (tokenStarted) {
    args.push(current);
  }

  return args;
}

function hasWindowsShellSyntax(command: string): boolean {
  let inQuotes = false;

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index]!;

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && /[&|<>^%!]/.test(char)) {
      return true;
    }
  }

  return false;
}

export function quoteArg(arg: string, os: string = platform()): string {
  if (os === "win32") {
    if (/[\s"&|<>^()]/.test(arg)) {
      // cmd.exe convention: double up inner quotes
      return `"${arg.replace(/"/g, '""')}"`;
    }
    return arg;
  }
  // Unix: use single quotes, escape existing single quotes
  if (/[\s"'\\$`!&|<>^();*?#~]/.test(arg)) {
    return `'${arg.replace(/'/g, "'\\''")}'`;
  }
  return arg;
}
