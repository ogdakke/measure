import { platform } from "node:os";

export function shellCommand(command: string): string[] {
  if (platform() === "win32") {
    return ["cmd", "/c", command];
  }
  return ["sh", "-c", command];
}
