import { Box, Text } from "ink";
import { formatDuration, formatMicroseconds, formatBytes } from "../format/units.ts";
import type { ExecutionResult } from "../types.ts";

interface SummaryProps {
  exec: ExecutionResult;
}

export function Summary({ exec }: SummaryProps) {
  const ok = exec.exitCode === 0;
  const s = exec.durationNs / 1_000_000_000;
  const durationColor = s < 5 ? "green" : s < 30 ? "yellow" : "red";

  return (
    <Box paddingLeft={2} gap={1}>
      <Text color={ok ? "green" : "red"}>{ok ? "✓" : "✗"}</Text>
      <Text bold color={durationColor}>{formatDuration(exec.durationNs)}</Text>
      {exec.cpuUserUs != null && exec.cpuSystemUs != null && (
        <>
          <Text dimColor>|</Text>
          <Text>cpu: {formatMicroseconds(exec.cpuUserUs)} user, {formatMicroseconds(exec.cpuSystemUs)} sys</Text>
        </>
      )}
      {exec.maxRss != null && (
        <>
          <Text dimColor>|</Text>
          <Text>mem: {formatBytes(exec.maxRss)}</Text>
        </>
      )}
      <Text dimColor>|</Text>
      <Text>exit: </Text>
      <Text color={ok ? undefined : "red"} dimColor={ok}>{String(exec.exitCode)}</Text>
    </Box>
  );
}
