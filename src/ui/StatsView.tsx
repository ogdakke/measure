import { Box, Text } from "ink";
import { renderTable, type Column } from "../format/table.ts";
import { formatDuration } from "../format/units.ts";
import type { AggregateStats } from "../types.ts";

interface StatsViewProps {
  stats: AggregateStats[];
  project?: string;
}

const columns: Column[] = [
  { key: "command", label: "Command", maxWidth: 30 },
  { key: "host", label: "Host", maxWidth: 16 },
  { key: "os", label: "OS" },
  { key: "cpu", label: "CPU", maxWidth: 24 },
  { key: "count", label: "Runs", align: "right" },
  { key: "mean", label: "Mean", align: "right" },
  { key: "median", label: "Median", align: "right" },
  { key: "min", label: "Min", align: "right" },
  { key: "max", label: "Max", align: "right" },
];

export function StatsView({ stats, project }: StatsViewProps) {
  if (stats.length === 0) {
    return (
      <Box paddingLeft={2} paddingY={1}>
        <Text dimColor>No measurements found.</Text>
      </Box>
    );
  }

  const tableRows = stats.map((s) => ({
    command: s.command,
    host: s.hostname,
    os: s.os,
    cpu: s.cpuModel,
    count: String(s.count),
    mean: formatDuration(s.meanNs),
    median: formatDuration(s.medianNs),
    min: formatDuration(s.minNs),
    max: formatDuration(s.maxNs),
  }));

  return (
    <Box flexDirection="column" paddingY={1}>
      <Box paddingLeft={2}>
        <Text bold>Aggregated Stats</Text>
        {project && <Text dimColor> — project: {project}</Text>}
      </Box>
      <Text>{renderTable(columns, tableRows)}</Text>
    </Box>
  );
}
