import { Box, Text } from "ink";
import { basename } from "node:path";
import type { ImportResult } from "../commands/import.ts";

interface ImportViewProps {
  results: ImportResult[];
}

export function ImportView({ results }: ImportViewProps) {
  const totalImported = results.reduce((s, r) => s + r.imported, 0);
  const totalSkipped = results.reduce((s, r) => s + r.skipped, 0);

  return (
    <Box flexDirection="column" paddingY={1}>
      {results.map((r) => (
        <Box key={r.file} paddingLeft={2} gap={1}>
          <Text color="green">+</Text>
          <Text color="cyan">{basename(r.file)}:</Text>
          <Text>{r.imported} measurements imported</Text>
          {r.skipped > 0 && <Text dimColor>({r.skipped} duplicates skipped)</Text>}
        </Box>
      ))}
      <Text />
      <Box paddingLeft={2} gap={1}>
        <Text bold>Total:</Text>
        <Text>
          {totalImported} imported from {results.length} file{results.length === 1 ? "" : "s"}
        </Text>
        {totalSkipped > 0 && <Text dimColor>({totalSkipped} skipped as duplicates)</Text>}
      </Box>
    </Box>
  );
}
