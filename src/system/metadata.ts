import { cpus, totalmem, platform, hostname } from "node:os";
import type { SystemInfo } from "../types.ts";

let cached: SystemInfo | null = null;

export function getSystemInfo(username: string): SystemInfo {
  if (cached) return cached;

  const cpuList = cpus();
  const shell =
    platform() === "win32" ? (process.env.ComSpec ?? null) : (process.env.SHELL ?? null);

  cached = {
    os: platform(),
    cpuModel: cpuList[0]?.model ?? "unknown",
    cpuCores: cpuList.length,
    ramBytes: totalmem(),
    hostname: hostname(),
    username,
    shell,
    bunVersion: Bun.version,
  };

  return cached;
}
