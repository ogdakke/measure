import { Box, Text } from "ink";
import { formatBytes } from "../format/units.ts";
import type { SystemInfo } from "../types.ts";

interface SystemViewProps {
  info: SystemInfo;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Box paddingLeft={2}>
      <Box width={12}>
        <Text dimColor>{label}</Text>
      </Box>
      <Text>{value}</Text>
    </Box>
  );
}

export function SystemView({ info }: SystemViewProps) {
  return (
    <Box flexDirection="column" paddingY={1}>
      <Box paddingLeft={2}>
        <Text bold>System Info</Text>
      </Box>
      <Row label="OS:" value={info.os} />
      <Row label="CPU:" value={info.cpuModel} />
      <Row label="Cores:" value={String(info.cpuCores)} />
      <Row label="RAM:" value={formatBytes(info.ramBytes)} />
      <Row label="Host:" value={info.hostname} />
      <Row label="User:" value={info.username} />
      <Row label="Shell:" value={info.shell ?? "unknown"} />
      <Row label="Bun:" value={info.bunVersion} />
    </Box>
  );
}
