import { Box, Text } from "ink";
import type { DbInfo } from "../commands/db.ts";

interface DbListViewProps {
  databases: DbInfo[];
}

export function DbListView({ databases }: DbListViewProps) {
  return (
    <Box flexDirection="column" paddingY={1}>
      <Box paddingLeft={2}>
        <Text bold>Databases:</Text>
      </Box>
      {databases.map((db) => (
        <Box key={db.name} paddingLeft={4} gap={1}>
          <Text color="cyan">{db.name}</Text>
          {db.active && <Text color="green">(active)</Text>}
          <Text dimColor>{db.path}</Text>
        </Box>
      ))}
    </Box>
  );
}
