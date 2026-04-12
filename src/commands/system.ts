import { getSystemInfo } from "../system/metadata.ts";
import type { SystemInfo } from "../types.ts";

export function systemCommand(username: string): SystemInfo {
  return getSystemInfo(username);
}
