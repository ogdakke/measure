import { Box, Text } from "ink";

export interface TableColumn {
  key: string;
  label: string;
  width?: string;
  align?: "left" | "right";
}

interface TableProps {
  columns: TableColumn[];
  rows: Record<string, string>[];
}

export function Table({ columns, rows }: TableProps) {
  return (
    <Box flexDirection="column" paddingLeft={2} width="100%">
      <Box width="100%">
        {columns.map((col) => (
          <Box key={col.key} width={col.width} justifyContent={col.align === "right" ? "flex-end" : "flex-start"}>
            <Text bold>{col.label}  </Text>
          </Box>
        ))}
      </Box>
      <Box width="100%">
        {columns.map((col) => (
          <Box key={col.key} width={col.width}>
            <Text dimColor>{"─".repeat(col.label.length + 2)}</Text>
          </Box>
        ))}
      </Box>
      {rows.map((row, i) => (
        <Box key={i} width="100%">
          {columns.map((col) => (
            <Box key={col.key} width={col.width} justifyContent={col.align === "right" ? "flex-end" : "flex-start"}>
              <Text>{row[col.key] ?? ""}  </Text>
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  );
}
