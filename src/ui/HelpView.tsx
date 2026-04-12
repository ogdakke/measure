import { Box, Text } from "ink";
import { REPL_SLASH_COMMANDS } from "../repl/slash-commands.ts";

export function HelpView() {
  return (
    <Box flexDirection="column" paddingY={1} paddingLeft={2}>
      <Box gap={1}>
        <Text bold>measure</Text>
        <Text dimColor>— Measure and compare command execution times</Text>
      </Box>
      <Text />
      <Text bold>Usage:</Text>
      <Text> measure Start REPL</Text>
      <Text> measure run {"<command...>"} One-shot measurement</Text>
      <Text> measure bench [-n count] [--warmup N] {"<cmd...>"} Benchmark N iterations</Text>
      <Text> measure history [--limit N] [--project P] Recent measurements</Text>
      <Text> measure stats [--project P] [--host H] Aggregated stats</Text>
      <Text> measure export [--format csv|json] [-o file] Export data</Text>
      <Text> measure import {"<files...>"} Import .db/.csv/.json files</Text>
      <Text> measure db list List databases</Text>
      <Text> measure db create {"<name>"} Create a new database</Text>
      <Text> measure db use {"<name>"} Switch active database</Text>
      <Text> measure system Show system info</Text>
      <Text />
      <Text bold>Options:</Text>
      <Text> --help, -h Show this help</Text>
      <Text> --version, -v Show version</Text>
      <Text> --db {"<name>"} Use a specific database</Text>
      <Text />
      <Text bold>REPL Commands:</Text>
      {REPL_SLASH_COMMANDS.map((command) => (
        <Text key={command.command}>
          {"  "}
          {command.helpLabel.padEnd(30)}
          {command.description}
        </Text>
      ))}
      <Text> Slash menu: type / to browse, Up/Down to select, Enter to run</Text>
      <Text> Tab prefills commands that take input</Text>
      <Text />
      <Text dimColor>Data stored at ~/.measure/ (use 'measure db list' to see databases)</Text>
    </Box>
  );
}
