import { Box, Text } from "ink";
import { Table, type TableColumn } from "./Table.tsx";
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

const columns: TableColumn[] = [
  { key: "id", label: "#", width: "5%", align: "right" },
  { key: "command", label: "Command", width: "30%" },
  { key: "duration", label: "Duration", width: "12%", align: "right" },
  { key: "exit", label: "Exit", width: "8%", align: "right" },
  { key: "project", label: "Project", width: "15%" },
  { key: "host", label: "Host", width: "15%" },
  { key: "date", label: "Date", width: "15%" },
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
    exit: String(m.exitCode),
    project: m.project ?? "—",
    host: m.hostname,
    date: formatDate(m.createdAt),
  }));

  return (
    <Box flexDirection="column" paddingY={1}>
      <Table columns={columns} rows={tableRows} />
    </Box>
  );
}
