import { useState, useEffect, useCallback } from "react";
import { Box, Text, Static, useApp, useStdout, renderToString } from "ink";
import type { Database } from "bun:sqlite";
import { spawnPiped, collectResult } from "../runner/execute-piped.ts";
import { insertMeasurement } from "../db/queries.ts";
import { getSystemInfo } from "../system/metadata.ts";
import { detectProject } from "../system/project.ts";
import { historyCommand } from "../commands/history.ts";
import { statsCommand } from "../commands/stats.ts";
import { exportCommand } from "../commands/export.ts";
import { importCommand } from "../commands/import.ts";
import { dbListCommand, dbCreateCommand, dbUseCommand } from "../commands/db.ts";
import { systemCommand } from "../commands/system.ts";
import { TextInput } from "./TextInput.tsx";
import { Summary } from "./Summary.tsx";
import { HistoryView } from "./HistoryView.tsx";
import { StatsView } from "./StatsView.tsx";
import { SystemView } from "./SystemView.tsx";
import { DbListView } from "./DbListView.tsx";
import { ImportView } from "./ImportView.tsx";
import { join } from "node:path";
import type { ExecutionResult } from "../types.ts";

interface ReplProps {
  db: Database;
  username: string;
}

interface HistoryItem {
  id: number;
  type: "command" | "info";
  command?: string;
  output?: string;
  exec?: ExecutionResult;
}

let nextId = 0;

export function Repl({ db, username }: ReplProps) {
  const { exit } = useApp();
  const { write } = useStdout();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [runningCommand, setRunningCommand] = useState("");
  const [version, setVersion] = useState("0.1.0");
  const [inputHistory, setInputHistory] = useState<string[]>([]);

  const system = getSystemInfo(username);
  const project = detectProject(process.cwd());

  useEffect(() => {
    (async () => {
      const pkg = await Bun.file(
        new URL("../../package.json", import.meta.url).pathname,
      ).json();
      setVersion(pkg.version ?? "0.1.0");
    })();
  }, []);

  const addInfoItem = useCallback((output: string) => {
    setItems((prev) => [...prev, { id: nextId++, type: "info", output }]);
  }, []);

  const handleDotCommand = useCallback(
    (input: string) => {
      const [cmd, ...args] = input.split(/\s+/);

      switch (cmd) {
        case ".help":
          addInfoItem(
            [
              "",
              "  REPL Commands:",
              "  .history [N]     Show last N measurements (default 10)",
              "  .stats           Show aggregated stats",
              "  .export [csv|json] [file]  Export to file",
              "  .import <files...>  Import .db/.csv/.json files",
              "  .db [list|create|use] [name]  Manage databases",
              "  .system          Show system info",
              "  .clear           Clear screen",
              "  .exit / .quit    Exit",
              "",
            ].join("\n"),
          );
          break;

        case ".history": {
          const limit = parseInt(args[0] ?? "10", 10) || 10;
          const result = historyCommand(db, limit);
          if (result.isErr()) {
            addInfoItem(`  Error: ${result.error.message}`);
          } else {
            const output = renderToString(<HistoryView rows={result.value} />);
            addInfoItem(output);
          }
          break;
        }

        case ".stats": {
          const result = statsCommand(db);
          if (result.isErr()) {
            addInfoItem(`  Error: ${result.error.message}`);
          } else {
            const output = renderToString(<StatsView stats={result.value} />);
            addInfoItem(output);
          }
          break;
        }

        case ".export": {
          const format = (args[0] === "json" ? "json" : "csv") as "csv" | "json";
          const date = new Date().toISOString().slice(0, 10);
          const filename = args[1] ?? join(process.cwd(), `measure-export-${date}.${format}`);
          const result = exportCommand(db, format, undefined, undefined, undefined, filename);
          if (result.isErr()) {
            addInfoItem(`  Error: ${result.error.message}`);
          } else if (result.value.path) {
            addInfoItem(`  Exported ${result.value.count} measurements to ${result.value.path}`);
          }
          break;
        }

        case ".import": {
          if (args.length === 0) {
            addInfoItem("  Usage: .import <file1.db|.csv|.json> [file2...]");
            break;
          }
          const result = importCommand(db, args);
          if (result.isErr()) {
            addInfoItem(`  Error: ${result.error.message}`);
          } else {
            const output = renderToString(<ImportView results={result.value} />);
            addInfoItem(output);
          }
          break;
        }

        case ".db": {
          const action = args[0] ?? "list";
          if (action === "list") {
            const output = renderToString(<DbListView databases={dbListCommand()} />);
            addInfoItem(output);
          } else if (action === "create") {
            if (!args[1]) {
              addInfoItem("  Usage: .db create <name>");
            } else {
              const result = dbCreateCommand(args[1]);
              if (result.isErr()) {
                addInfoItem(`  Error: ${result.error.message}`);
              } else {
                addInfoItem(`  Created database ${result.value.name} at ${result.value.path}`);
              }
            }
          } else if (action === "use") {
            if (!args[1]) {
              addInfoItem("  Usage: .db use <name>");
            } else {
              const result = dbUseCommand(args[1]);
              if (result.isErr()) {
                addInfoItem(`  Error: ${result.error.message}`);
              } else {
                addInfoItem(`  Switched to database ${result.value}`);
              }
            }
          } else {
            addInfoItem(`  Unknown db action: ${action}. Use list, create, or use.`);
          }
          break;
        }

        case ".system": {
          const info = systemCommand(username);
          const output = renderToString(<SystemView info={info} />);
          addInfoItem(output);
          break;
        }

        case ".clear":
          process.stdout.write("\x1B[2J\x1B[3J\x1B[H");
          setItems([]);
          break;

        case ".exit":
        case ".quit":
          exit();
          break;

        default:
          addInfoItem(`  Unknown command: ${cmd}. Type .help for options.`);
          break;
      }
    },
    [db, username, addInfoItem, exit],
  );

  const handleSubmit = useCallback(
    async (input: string) => {
      if (!input.trim()) return;

      // Add to input history (most recent first)
      setInputHistory((prev) => [input, ...prev.filter((h) => h !== input)]);

      if (input.trim().startsWith(".")) {
        handleDotCommand(input.trim());
        return;
      }

      // Execute and measure the command
      setIsRunning(true);
      setRunningCommand(input);

      try {
        const execution = spawnPiped(input);
        const decoder = new TextDecoder();

        // Stream stdout
        const stdoutReader = execution.proc.stdout.getReader();
        (async () => {
          try {
            while (true) {
              const { done, value } = await stdoutReader.read();
              if (done) break;
              write(decoder.decode(value, { stream: true }));
            }
          } catch {
            // Process ended
          }
        })();

        // Stream stderr
        const stderrReader = execution.proc.stderr.getReader();
        (async () => {
          try {
            while (true) {
              const { done, value } = await stderrReader.read();
              if (done) break;
              write(decoder.decode(value, { stream: true }));
            }
          } catch {
            // Process ended
          }
        })();

        const exitCode = await execution.proc.exited;
        const exec = collectResult(execution, exitCode);

        // Save to DB
        insertMeasurement(db, {
          command: input,
          project,
          execution: exec,
          system,
          cwd: process.cwd(),
          benchGroup: null,
        });

        // Add to history
        const summaryStr = renderToString(<Summary exec={exec} />);
        setItems((prev) => [
          ...prev,
          {
            id: nextId++,
            type: "command",
            command: input,
            exec,
            output: summaryStr,
          },
        ]);
      } catch (e) {
        addInfoItem(`  Error: ${String(e)}`);
      } finally {
        setIsRunning(false);
        setRunningCommand("");
      }
    },
    [db, system, project, write, handleDotCommand, addInfoItem],
  );

  return (
    <>
      <Box flexDirection="column" paddingBottom={1}>
        <Box paddingLeft={2} gap={1}>
          <Text bold>measure</Text>
          <Text>v{version}</Text>
          <Text dimColor>|</Text>
          <Text>project: </Text>
          <Text color="cyan">{project ?? "unknown"}</Text>
          <Text dimColor>|</Text>
          <Text>host: </Text>
          <Text color="cyan">{system.hostname}</Text>
          <Text dimColor>|</Text>
          <Text>user: </Text>
          <Text color="cyan">{username}</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text dimColor>Type a command to measure, or .help for options.</Text>
        </Box>
      </Box>

      <Static items={items}>
        {(item) => (
          <Box key={`item-${item.id}`} flexDirection="column">
            {item.output && <Text>{item.output}</Text>}
          </Box>
        )}
      </Static>

      <Box>
        {isRunning ? (
          <Text dimColor>  Running: {runningCommand}...</Text>
        ) : (
          <TextInput prompt="measure > " onSubmit={handleSubmit} active={!isRunning} history={inputHistory} />
        )}
      </Box>
    </>
  );
}
