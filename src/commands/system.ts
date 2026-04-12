import { getSystemInfo } from "../system/metadata.ts";
import { bold, dim } from "../format/colors.ts";
import { formatBytes } from "../format/units.ts";

export function systemCommand(username: string): void {
  const sys = getSystemInfo(username);

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
}
