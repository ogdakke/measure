import { Box, Text } from "ink";
import { green, red, dim } from "../format/colors.ts";
import { renderTable, type Column } from "../format/table.ts";
import { formatDuration } from "../format/units.ts";
import type { Measurement } from "../types.ts";

interface HistoryViewProps {
  rows: Measurement[];
}

function formatDate(iso: string): string {
  const d = new Date(iso + "Z");
  const month = d.toLocaleString("en", { month: "short" });
  const day = d.getDate();
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${month} ${day} ${h}:${m}`;
}

const columns: Column[] = [
  { key: "id", label: "#", align: "right" },
  { key: "command", label: "Command", maxWidth: 40 },
  { key: "duration", label: "Duration", align: "right" },
  { key: "exit", label: "Exit", align: "right" },
  { key: "project", label: "Project", maxWidth: 20 },
  { key: "host", label: "Host", maxWidth: 16 },
  { key: "date", label: "Date" },
];

export function HistoryView({ rows }: HistoryViewProps) {
  if (rows.length === 0) {
    return (
      <Box paddingLeft={2} paddingY={1}>
        <Text dimColor>No measurements found.</Text>
      </Box>
    );
  }

  const tableRows = rows.map((m) => ({
    id: String(m.id),
    command: m.command,
    duration: formatDuration(m.durationNs),
    exit: m.exitCode === 0 ? green(String(m.exitCode)) : red(String(m.exitCode)),
    project: m.project ?? dim("—"),
    host: m.hostname,
    date: formatDate(m.createdAt),
  }));

  return (
    <Box flexDirection="column" paddingY={1}>
      <Text>{renderTable(columns, tableRows)}</Text>
    </Box>
  );
}
