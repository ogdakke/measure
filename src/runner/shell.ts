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

export function shellCommand(command: string): string[] {
  if (platform() === "win32") {
    // /d disables AutoRun registry commands
    // /s with /c "..." strips the outermost quotes and runs the content as-is,
    // preserving inner quotes (e.g. git commit -m "foo bar")
    return ["cmd", "/d", "/s", "/c", `"${command}"`];
  }
  return ["sh", "-c", command];
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
