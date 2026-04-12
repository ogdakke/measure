import { useState, useEffect, useCallback, type ReactNode } from "react";
import { Box, Text, Static, useApp, renderToString } from "ink";
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
import {
  formatReplSlashCommandHelpLines,
  parseReplSlashCommand,
  REPL_SLASH_COMMANDS,
} from "../repl/slash-commands.ts";

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

function renderForTerminal(node: ReactNode): string {
  return renderToString(node, { columns: process.stdout.columns ?? 80 });
}

export function getReplPrompt(hasSubmittedCommand: boolean): string {
  return hasSubmittedCommand ? "> " : "measure > ";
}

export function shouldShowReplIntro(hasSubmittedCommand: boolean): boolean {
  return !hasSubmittedCommand;
}

function CommandItem({
  command,
  output,
  exec,
}: {
  command: string;
  output?: string;
  exec?: ExecutionResult;
}) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text dimColor>&gt; </Text>
        <Text>{command}</Text>
      </Box>
      {output && <Text>{output}</Text>}
      {exec && <Summary exec={exec} />}
    </Box>
  );
}

export function Repl({ db, username }: ReplProps) {
  const { exit } = useApp();
  const [currentDb, setCurrentDb] = useState(db);
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [runningCommand, setRunningCommand] = useState("");
  const [runningOutput, setRunningOutput] = useState("");
  const [version, setVersion] = useState("0.1.0");
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [hasSubmittedCommand, setHasSubmittedCommand] = useState(false);

  const system = getSystemInfo(username);
  const project = detectProject(process.cwd());

  useEffect(() => {
    (async () => {
      const pkg = await Bun.file(new URL("../../package.json", import.meta.url).pathname).json();
      setVersion(pkg.version ?? "0.1.0");
    })();
  }, []);

  const addInfoItem = useCallback((output: string) => {
    setItems((prev) => [...prev, { id: nextId++, type: "info", output }]);
  }, []);

  const handleSlashCommand = useCallback(
    (input: string) => {
      const { command, args } = parseReplSlashCommand(input);

      switch (command?.key) {
        case "help":
          addInfoItem(
            [
              "",
              "  REPL Commands:",
              ...formatReplSlashCommandHelpLines(),
              "  Slash menu: type / to browse, Up/Down to select, Enter to run,",
              "              Tab to prefill commands that take input",
              "  Editing: arrows/home/end, Ctrl+A/E/B/F/D/W/U/K, Ctrl+P/N history,",
              "           Alt/Option+B/F/D, Alt/Option+Backspace/Delete, Ctrl/Alt+Left/Right",
              "",
            ].join("\n"),
          );
          break;

        case "history": {
          const limit = parseInt(args[0] ?? "10", 10) || 10;
          const result = historyCommand(currentDb, limit);
          if (result.isErr()) {
            addInfoItem(`  Error: ${result.error.message}`);
          } else {
            const output = renderForTerminal(<HistoryView rows={result.value} />);
            addInfoItem(output);
          }
          break;
        }

        case "stats": {
          const result = statsCommand(currentDb);
          if (result.isErr()) {
            addInfoItem(`  Error: ${result.error.message}`);
          } else {
            const output = renderForTerminal(<StatsView stats={result.value} />);
            addInfoItem(output);
          }
          break;
        }

        case "export": {
          const format = (args[0] === "json" ? "json" : "csv") as "csv" | "json";
          const date = new Date().toISOString().slice(0, 10);
          const filename = args[1] ?? join(process.cwd(), `measure-export-${date}.${format}`);
          const result = exportCommand(currentDb, format, undefined, undefined, undefined, filename);
          if (result.isErr()) {
            addInfoItem(`  Error: ${result.error.message}`);
          } else if (result.value.path) {
            addInfoItem(`  Exported ${result.value.count} measurements to ${result.value.path}`);
          }
          break;
        }

        case "import": {
          if (args.length === 0) {
            addInfoItem("  Usage: /import <file1.db|.csv|.json> [file2...]");
            break;
          }
          const result = importCommand(currentDb, args);
          if (result.isErr()) {
            addInfoItem(`  Error: ${result.error.message}`);
          } else {
            const output = renderForTerminal(<ImportView results={result.value} />);
            addInfoItem(output);
          }
          break;
        }

        case "db": {
          const action = args[0] ?? "list";
          if (action === "list") {
            const output = renderForTerminal(<DbListView databases={dbListCommand()} />);
            addInfoItem(output);
          } else if (action === "create") {
            if (!args[1]) {
              addInfoItem("  Usage: /db create <name>");
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
              addInfoItem("  Usage: /db use <name>");
            } else {
              const result = dbUseCommand(args[1]);
              if (result.isErr()) {
                addInfoItem(`  Error: ${result.error.message}`);
              } else {
                setCurrentDb(result.value.db);
                addInfoItem(`  Switched to database ${result.value.name}`);
              }
            }
          } else {
            addInfoItem(`  Unknown db action: ${action}. Use list, create, or use.`);
          }
          break;
        }

        case "system": {
          const info = systemCommand(username);
          const output = renderForTerminal(<SystemView info={info} />);
          addInfoItem(output);
          break;
        }

        case "clear":
          process.stdout.write("\x1B[2J\x1B[3J\x1B[H");
          setItems([]);
          break;

        case "exit":
          exit();
          break;

        default:
          addInfoItem(`  Unknown command: ${input.trim()}. Type /help for options.`);
          break;
      }
    },
    [currentDb, username, addInfoItem, exit],
  );

  const handleSubmit = useCallback(
    async (input: string) => {
      if (!input.trim()) return;
      setHasSubmittedCommand(true);

      // Add to input history (most recent first)
      setInputHistory((prev) => [input, ...prev.filter((h) => h !== input)]);

      if (input.trim().startsWith("/")) {
        handleSlashCommand(input.trim());
        return;
      }

      // Execute and measure the command
      setIsRunning(true);
      setRunningCommand(input);
      setRunningOutput("");

      try {
        const execution = spawnPiped(input);
        const decoder = new TextDecoder();
        let capturedOutput = "";

        // Stream stdout
        const stdoutReader = execution.proc.stdout.getReader();
        const stdoutTask = (async () => {
          try {
            while (true) {
              const { done, value } = await stdoutReader.read();
              if (done) break;
              const chunk = decoder.decode(value, { stream: true });
              capturedOutput += chunk;
              setRunningOutput((prev) => prev + chunk);
            }
          } catch {
            // Process ended
          }
        })();

        // Stream stderr
        const stderrReader = execution.proc.stderr.getReader();
        const stderrTask = (async () => {
          try {
            while (true) {
              const { done, value } = await stderrReader.read();
              if (done) break;
              const chunk = decoder.decode(value, { stream: true });
              capturedOutput += chunk;
              setRunningOutput((prev) => prev + chunk);
            }
          } catch {
            // Process ended
          }
        })();

        const exitCode = await execution.proc.exited;
        await Promise.all([stdoutTask, stderrTask]);
        const exec = collectResult(execution, exitCode);

        // Save to DB
        insertMeasurement(currentDb, {
          command: input,
          project,
          execution: exec,
          system,
          cwd: process.cwd(),
          benchGroup: null,
        });

        // Keep each finished command as a single history block so its output has context.
        setItems((prev) => [
          ...prev,
          {
            id: nextId++,
            type: "command",
            command: input,
            exec,
            output: capturedOutput || undefined,
          },
        ]);
      } catch (e) {
        addInfoItem(`  Error: ${String(e)}`);
      } finally {
        setIsRunning(false);
        setRunningCommand("");
        setRunningOutput("");
      }
    },
    [currentDb, system, project, handleSlashCommand, addInfoItem],
  );

  return (
    <>
      {shouldShowReplIntro(hasSubmittedCommand) && (
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
            <Text dimColor>Type a command to measure, or start with / for slash commands.</Text>
          </Box>
        </Box>
      )}

      <Static items={items}>
        {(item) => (
          <Box key={`item-${item.id}`} flexDirection="column">
            {item.type === "command" && item.command ? (
              <CommandItem command={item.command} output={item.output} exec={item.exec} />
            ) : (
              item.output && <Text>{item.output}</Text>
            )}
          </Box>
        )}
      </Static>

      {isRunning && <CommandItem command={runningCommand} output={runningOutput || undefined} />}

      <Box>
        {!isRunning && (
          <TextInput
            prompt={getReplPrompt(hasSubmittedCommand)}
            onSubmit={handleSubmit}
            active={!isRunning}
            history={inputHistory}
            slashCommands={REPL_SLASH_COMMANDS}
          />
        )}
      </Box>
    </>
  );
}
