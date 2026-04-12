import { Box, Text } from "ink";
import { Table, type TableColumn } from "./Table.tsx";
import { formatDuration } from "../format/units.ts";
import type { AggregateStats } from "../types.ts";

interface StatsViewProps {
  stats: AggregateStats[];
  project?: string;
}

const columns: TableColumn[] = [
  { key: "command", label: "Command", width: "18%" },
  { key: "host", label: "Host", width: "12%" },
  { key: "os", label: "OS", width: "8%" },
  { key: "cpu", label: "CPU", width: "16%" },
  { key: "count", label: "Runs", width: "6%", align: "right" },
  { key: "mean", label: "Mean", width: "10%", align: "right" },
  { key: "median", label: "Median", width: "10%", align: "right" },
  { key: "min", label: "Min", width: "10%", align: "right" },
  { key: "max", label: "Max", width: "10%", align: "right" },
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
      <Table columns={columns} rows={tableRows} />
    </Box>
  );
}
