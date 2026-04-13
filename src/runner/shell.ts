import { platform } from "node:os";

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
