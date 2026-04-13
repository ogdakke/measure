import type { Database } from "bun:sqlite";
import { Box, renderToString, Static, Text, useApp, useInput, useStdout } from "ink";
import { join } from "node:path";
import { APP_VERSION } from "../app-meta.ts";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { dbCreateCommand, dbListCommand, dbUseCommand } from "../commands/db.ts";
import { exportCommand } from "../commands/export.ts";
import { historyCommand } from "../commands/history.ts";
import { importCommand } from "../commands/import.ts";
import { statsCommand } from "../commands/stats.ts";
import { systemCommand } from "../commands/system.ts";
import { insertMeasurement } from "../db/queries.ts";
import { describeUnknownError } from "../errors.ts";
import { formatDuration } from "../format/units.ts";
import {
  formatReplSlashCommandHelpLines,
  parseReplSlashCommand,
  REPL_SLASH_COMMANDS,
} from "../repl/slash-commands.ts";
import {
  cancelPipedExecution,
  collectResult,
  spawnPiped,
  type PipedExecution,
} from "../runner/execute-piped.ts";
import { getSystemInfo } from "../system/metadata.ts";
import { detectProject } from "../system/project.ts";
import type { ExecutionResult } from "../types.ts";
import { DbListView } from "./DbListView.tsx";
import { HistoryView } from "./HistoryView.tsx";
import { ImportView } from "./ImportView.tsx";
import { StatsView } from "./StatsView.tsx";
import { Summary } from "./Summary.tsx";
import { SystemView } from "./SystemView.tsx";
import { TextInput } from "./TextInput.tsx";

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

export type ShellStatus = "running" | "stopping" | "exited" | "failed" | "cancelled";

interface ShellSession {
  id: number;
  command: string;
  output: string;
  status: ShellStatus;
  startedAtNs: number;
  endedAtNs?: number;
  exitCode?: number;
  isBackground: boolean;
  collectMeasurement: boolean;
}

type ShellUiMode = "closed" | "badge" | "picker" | "logs";

const SHELL_ACCENT_COLOR = "cyanBright";
const MAX_SHELL_OUTPUT_CHARS = 120_000;
const MAX_VISIBLE_SHELLS = 8;
const LOG_PANEL_LINE_COUNT = 12;
const SHELL_PIPE_DRAIN_TIMEOUT_MS = 500;

let nextHistoryId = 0;
let nextShellId = 0;

function renderForTerminal(node: ReactNode): string {
  return renderToString(node, { columns: process.stdout.columns ?? 80 });
}

async function settleShellOutputReaders(
  readers: Array<{ cancel: () => Promise<void> }>,
  tasks: Promise<void>[],
  timeoutMs = SHELL_PIPE_DRAIN_TIMEOUT_MS,
) {
  const outcome = await Promise.race([
    Promise.allSettled(tasks).then(() => "done" as const),
    Bun.sleep(timeoutMs).then(() => "timeout" as const),
  ]);

  if (outcome === "done") {
    return;
  }

  await Promise.allSettled(readers.map((reader) => reader.cancel()));
  await Promise.allSettled(tasks);
}

function appendShellOutput(output: string, chunk: string): string {
  const next = output + chunk;
  return next.length <= MAX_SHELL_OUTPUT_CHARS ? next : next.slice(-MAX_SHELL_OUTPUT_CHARS);
}

export function formatCancelledCommandOutput(output: string): string {
  const trimmed = output.trimEnd();
  return trimmed ? `${trimmed}\n\n[cancelled]` : "[cancelled]";
}

export function getRunningCommandStatus(isCancelling: boolean): string {
  return isCancelling
    ? "Cancelling command..."
    : "Running command. Press Ctrl+B to send it to shells, or Esc to cancel.";
}

export function getReplPrompt(hasSubmittedCommand: boolean): string {
  return hasSubmittedCommand ? "> " : "measure > ";
}

export function shouldShowReplIntro(hasSubmittedCommand: boolean): boolean {
  return !hasSubmittedCommand;
}

export function getShellCountLabel(count: number): string {
  return `${count} shell${count === 1 ? "" : "s"}`;
}

export function getVisibleShellWindow(
  total: number,
  selected: number,
  windowSize = MAX_VISIBLE_SHELLS,
) {
  if (total <= windowSize) {
    return { start: 0, end: total };
  }

  const safeSelected = Math.min(Math.max(selected, 0), total - 1);
  const halfWindow = Math.floor(windowSize / 2);
  const start = Math.min(Math.max(safeSelected - halfWindow, 0), total - windowSize);
  return { start, end: start + windowSize };
}

function getShellOutputLines(output: string): string[] {
  const normalized = output.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!normalized) {
    return [];
  }
  return normalized.split("\n");
}

export function getShellPreviewLine(output: string): string | undefined {
  const lines = getShellOutputLines(output);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]?.trim();
    if (line) {
      return line;
    }
  }
  return undefined;
}

export function getShellStatusLabel(shell: Pick<ShellSession, "status" | "exitCode">): string {
  switch (shell.status) {
    case "running":
      return "running";
    case "stopping":
      return "stopping";
    case "exited":
      return "done";
    case "failed":
      return shell.exitCode == null ? "failed" : `failed (${shell.exitCode})`;
    case "cancelled":
      return "cancelled";
    default:
      return shell.status;
  }
}

function getShellStatusColor(status: ShellStatus): string {
  switch (status) {
    case "running":
      return "green";
    case "stopping":
      return "yellow";
    case "failed":
      return "red";
    case "cancelled":
      return "gray";
    case "exited":
      return "white";
    default:
      return "white";
  }
}

export function getShellRuntimeLabel(
  shell: Pick<ShellSession, "startedAtNs" | "endedAtNs">,
  nowNs: number,
) {
  const durationNs = Math.max((shell.endedAtNs ?? nowNs) - shell.startedAtNs, 0);
  return formatDuration(durationNs);
}

export function getShellLogLines(
  output: string,
  scrollOffset: number,
  maxLines = LOG_PANEL_LINE_COUNT,
) {
  const lines = getShellOutputLines(output);
  const safeOffset = Math.min(Math.max(scrollOffset, 0), Math.max(lines.length - maxLines, 0));
  const end = Math.max(lines.length - safeOffset, 0);
  const start = Math.max(end - maxLines, 0);
  return lines.slice(start, end);
}

function getShellMaxScrollOffset(output: string, maxLines = LOG_PANEL_LINE_COUNT) {
  return Math.max(getShellOutputLines(output).length - maxLines, 0);
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

function ShellsBox({
  shells,
  mode,
  selectedShellId,
  logShell,
  logScrollOffset,
  nowNs,
}: {
  shells: ShellSession[];
  mode: ShellUiMode;
  selectedShellId: number | null;
  logShell: ShellSession | null;
  logScrollOffset: number;
  nowNs: number;
}) {
  const countLabel = getShellCountLabel(shells.length);
  const isCompact = mode === "closed" || mode === "badge";
  const isCompactFocused = mode === "badge";

  if (isCompact) {
    return (
      <Box marginTop={1}>
        <Box borderStyle="round" borderColor={SHELL_ACCENT_COLOR} paddingX={1}>
          <Text
            color={isCompactFocused ? "black" : SHELL_ACCENT_COLOR}
            backgroundColor={isCompactFocused ? SHELL_ACCENT_COLOR : undefined}
          >
            {countLabel}
          </Text>
        </Box>
      </Box>
    );
  }

  const selectedIndex = Math.max(
    0,
    shells.findIndex((shell) => shell.id === selectedShellId),
  );
  const { start, end } = getVisibleShellWindow(shells.length, selectedIndex);
  const windowedShells = shells.slice(start, end);
  const runningShellCount = shells.filter(
    (shell) => shell.status === "running" || shell.status === "stopping",
  ).length;
  const logLines = logShell ? getShellLogLines(logShell.output, logScrollOffset) : [];
  const isFollowing = logScrollOffset === 0;

  return (
    <Box marginTop={1} width="100%">
      <Box
        width="100%"
        flexDirection="column"
        borderStyle="round"
        borderColor={SHELL_ACCENT_COLOR}
        paddingX={1}
      >
        <Text color={SHELL_ACCENT_COLOR} bold>
          {logShell ? "Shell logs" : "Background shells"}
        </Text>
        {logShell ? (
          <>
            <Text>{logShell.command}</Text>
            <Text dimColor>
              status: {getShellStatusLabel(logShell)} · {isFollowing ? "following" : "scrolling"}
            </Text>
            <Box flexDirection="column" marginTop={1}>
              {logLines.length > 0 ? (
                logLines.map((line, index) => (
                  <Text key={`shell-log-${logShell.id}-${index}`}>{line || " "}</Text>
                ))
              ) : (
                <Text dimColor>No output yet.</Text>
              )}
            </Box>
          </>
        ) : (
          <>
            <Text dimColor>
              {runningShellCount} active {getShellCountLabel(runningShellCount)}
            </Text>
            <Box flexDirection="column" marginTop={1}>
              {windowedShells.map((shell) => {
                const isSelected = shell.id === selectedShellId;
                return (
                  <Box key={`shell-row-${shell.id}`} flexDirection="column">
                    <Box>
                      <Text color={isSelected ? SHELL_ACCENT_COLOR : "gray"}>
                        {isSelected ? "› " : "  "}
                      </Text>
                      <Text color={isSelected ? "#cbd6ff" : undefined}>{shell.command}</Text>
                      <Text color={getShellStatusColor(shell.status)}>
                        {" "}
                        ({getShellStatusLabel(shell)})
                      </Text>
                      <Text dimColor> · {getShellRuntimeLabel(shell, nowNs)}</Text>
                    </Box>
                  </Box>
                );
              })}
            </Box>
            {shells.length > windowedShells.length && (
              <Text dimColor>
                Showing {start + 1}-{end} of {shells.length}
              </Text>
            )}
          </>
        )}
        <Box marginTop={1}>
          <Text dimColor>
            {logShell
              ? "↑/↓ to scroll · End to follow · x to stop · Esc to picker"
              : "↑/↓ to select · Enter to view · x to stop · Esc to close"}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}

export function Repl({ db, username }: ReplProps) {
  const app = useApp();
  const stdout = useStdout();
  const [currentDb, setCurrentDb] = useState(db);
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [shells, setShells] = useState<ShellSession[]>([]);
  const [foregroundShellId, setForegroundShellId] = useState<number | null>(null);
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [hasSubmittedCommand, setHasSubmittedCommand] = useState(false);
  const [shellUiMode, setShellUiMode] = useState<ShellUiMode>("closed");
  const [selectedShellId, setSelectedShellId] = useState<number | null>(null);
  const [logShellId, setLogShellId] = useState<number | null>(null);
  const [logScrollOffset, setLogScrollOffset] = useState(0);
  const [shellViewNowNs, setShellViewNowNs] = useState(Bun.nanoseconds());
  const shellExecutionsRef = useRef(new Map<number, PipedExecution>());
  const shellCancelRequestsRef = useRef(new Set<number>());
  const shellsRef = useRef<ShellSession[]>([]);

  const system = getSystemInfo(username);
  const project = detectProject(process.cwd());
  const foregroundShell =
    foregroundShellId == null
      ? null
      : (shells.find((shell) => shell.id === foregroundShellId) ?? null);
  const visibleShells = shells.filter((shell) => shell.isBackground);
  const selectedShell =
    selectedShellId == null
      ? null
      : (visibleShells.find((shell) => shell.id === selectedShellId) ?? null);
  const logShell =
    logShellId == null ? null : (visibleShells.find((shell) => shell.id === logShellId) ?? null);
  const isPromptActive = foregroundShell == null && shellUiMode === "closed";

  useEffect(() => {
    shellsRef.current = shells;
  }, [shells]);

  useEffect(() => {
    if (visibleShells.length === 0) {
      setShellUiMode("closed");
      setSelectedShellId(null);
      setLogShellId(null);
      setLogScrollOffset(0);
      return;
    }

    if (selectedShellId == null || !visibleShells.some((shell) => shell.id === selectedShellId)) {
      setSelectedShellId(visibleShells[0]?.id ?? null);
    }

    if (logShellId != null && !visibleShells.some((shell) => shell.id === logShellId)) {
      setShellUiMode("closed");
      setLogShellId(null);
      setLogScrollOffset(0);
    }
  }, [visibleShells, selectedShellId, logShellId]);

  const addInfoItem = useCallback((output: string) => {
    setItems((prev) => [...prev, { id: nextHistoryId++, type: "info", output }]);
  }, []);

  const clearScreen = useCallback(() => {
    setItems([]);
    void (async () => {
      await app.waitUntilRenderFlush();
      stdout.write("\x1B[2J\x1B[3J\x1B[H");
    })();
  }, [app, stdout]);

  const updateShell = useCallback(
    (shellId: number, update: (shell: ShellSession) => ShellSession) => {
      setShells((prev) => prev.map((shell) => (shell.id === shellId ? update(shell) : shell)));
    },
    [],
  );

  const removeShell = useCallback((shellId: number) => {
    shellExecutionsRef.current.delete(shellId);
    shellCancelRequestsRef.current.delete(shellId);
    setShells((prev) => prev.filter((shell) => shell.id !== shellId));
    setForegroundShellId((current) => (current === shellId ? null : current));
    setSelectedShellId((current) => (current === shellId ? null : current));
    setLogShellId((current) => (current === shellId ? null : current));
  }, []);

  const requestShellStop = useCallback(
    (shellId: number) => {
      const execution = shellExecutionsRef.current.get(shellId);
      if (!execution || shellCancelRequestsRef.current.has(shellId)) {
        return;
      }

      shellCancelRequestsRef.current.add(shellId);
      updateShell(shellId, (shell) => ({
        ...shell,
        status: "stopping",
        collectMeasurement: false,
      }));
      cancelPipedExecution(execution);
    },
    [updateShell],
  );

  const backgroundForegroundShell = useCallback(() => {
    if (foregroundShellId == null) {
      return;
    }

    const shell = shellsRef.current.find((entry) => entry.id === foregroundShellId);
    if (!shell || shell.isBackground || shell.status !== "running") {
      return;
    }

    updateShell(foregroundShellId, (current) => ({
      ...current,
      isBackground: true,
      collectMeasurement: false,
    }));
    setForegroundShellId(null);
    setShellViewNowNs(Bun.nanoseconds());
  }, [foregroundShellId, updateShell]);

  const focusShellBadge = useCallback(() => {
    if (visibleShells.length === 0) {
      return;
    }

    setShellViewNowNs(Bun.nanoseconds());
    setShellUiMode("badge");
    setLogShellId(null);
    setLogScrollOffset(0);
    setSelectedShellId((current) => current ?? visibleShells[0]?.id ?? null);
  }, [visibleShells]);

  const openShellPicker = useCallback(() => {
    if (visibleShells.length === 0) {
      return;
    }

    setShellViewNowNs(Bun.nanoseconds());
    setShellUiMode("picker");
    setLogShellId(null);
    setLogScrollOffset(0);
    setSelectedShellId((current) => current ?? visibleShells[0]?.id ?? null);
  }, [visibleShells]);

  const moveShellSelection = useCallback(
    (delta: number) => {
      if (visibleShells.length === 0) {
        return;
      }

      const currentIndex = Math.max(
        0,
        visibleShells.findIndex((shell) => shell.id === selectedShellId),
      );
      const nextIndex = Math.min(Math.max(currentIndex + delta, 0), visibleShells.length - 1);
      setSelectedShellId(visibleShells[nextIndex]?.id ?? null);
    },
    [visibleShells, selectedShellId],
  );

  const closeShellUi = useCallback(() => {
    setLogShellId(null);
    setLogScrollOffset(0);
    setShellUiMode("closed");
  }, []);

  const closeShellLogs = useCallback(() => {
    setShellViewNowNs(Bun.nanoseconds());
    setLogShellId(null);
    setLogScrollOffset(0);
    setShellUiMode("picker");
  }, []);

  useInput(
    (input, key) => {
      if (foregroundShell) {
        if (key.ctrl && input === "b") {
          backgroundForegroundShell();
          return;
        }

        if (key.escape || (key.ctrl && input === "c")) {
          requestShellStop(foregroundShell.id);
        }
        return;
      }

      if (shellUiMode === "logs" && logShell) {
        if (key.escape) {
          closeShellLogs();
          return;
        }

        if (key.upArrow) {
          setLogScrollOffset((current) =>
            Math.min(current + 1, getShellMaxScrollOffset(logShell.output)),
          );
          return;
        }

        if (key.downArrow) {
          setLogScrollOffset((current) => Math.max(current - 1, 0));
          return;
        }

        if (key.end) {
          setLogScrollOffset(0);
          return;
        }

        if (input.toLowerCase() === "x") {
          if (logShell.status === "running" || logShell.status === "stopping") {
            requestShellStop(logShell.id);
          } else {
            removeShell(logShell.id);
          }
        }
        return;
      }

      if (shellUiMode === "badge") {
        if (key.escape || key.upArrow) {
          closeShellUi();
          return;
        }

        if (key.return) {
          openShellPicker();
        }
        return;
      }

      if (shellUiMode !== "picker" || visibleShells.length === 0) {
        return;
      }

      if (key.escape) {
        closeShellUi();
        return;
      }

      if (key.upArrow) {
        moveShellSelection(-1);
        return;
      }

      if (key.downArrow) {
        moveShellSelection(1);
        return;
      }

      if (key.return) {
        if (selectedShell) {
          setShellViewNowNs(Bun.nanoseconds());
          setLogShellId(selectedShell.id);
          setLogScrollOffset(0);
          setShellUiMode("logs");
        }
        return;
      }

      if (input.toLowerCase() === "x" && selectedShell) {
        if (selectedShell.status === "running" || selectedShell.status === "stopping") {
          requestShellStop(selectedShell.id);
        } else {
          removeShell(selectedShell.id);
        }
      }
    },
    {
      isActive: foregroundShell != null || shellUiMode !== "closed",
    },
  );

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
              "  Running commands: Ctrl+B backgrounds the current shell, Esc cancels it",
              "  Background shells: Down focuses the shells chip, Enter opens the picker",
              "  Slash menu: type / to browse, Up/Down to select, Enter to run,",
              "              Tab to prefill commands that take input",
              "  Editing: arrows/home/end, Ctrl+A/E/B/F/D/W/U/K/L, Ctrl+P/N history,",
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
          const result = exportCommand(
            currentDb,
            format,
            undefined,
            undefined,
            undefined,
            filename,
          );
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
          clearScreen();
          break;

        case "exit":
          app.exit();
          break;

        default:
          addInfoItem(`  Unknown command: ${input.trim()}. Type /help for options.`);
          break;
      }
    },
    [app, currentDb, username, addInfoItem, clearScreen],
  );

  const handleSubmit = useCallback(
    async (input: string) => {
      if (!input.trim()) {
        return;
      }

      setHasSubmittedCommand(true);
      setInputHistory((prev) => [input, ...prev.filter((entry) => entry !== input)]);

      if (input.trim().startsWith("/")) {
        handleSlashCommand(input.trim());
        return;
      }

      const shellId = nextShellId++;
      const execution = spawnPiped(input);
      const decoder = new TextDecoder();
      let capturedOutput = "";

      setForegroundShellId(shellId);
      setShells((prev) => [
        ...prev,
        {
          id: shellId,
          command: input,
          output: "",
          status: "running",
          startedAtNs: execution.startNs,
          isBackground: false,
          collectMeasurement: true,
        },
      ]);
      shellExecutionsRef.current.set(shellId, execution);

      const appendOutputChunk = (chunk: string) => {
        capturedOutput += chunk;
        updateShell(shellId, (shell) => ({
          ...shell,
          output: appendShellOutput(shell.output, chunk),
        }));
      };

      try {
        const stdoutReader = execution.proc.stdout.getReader();
        const stdoutTask = (async () => {
          try {
            while (true) {
              const { done, value } = await stdoutReader.read();
              if (done) {
                break;
              }
              appendOutputChunk(decoder.decode(value, { stream: true }));
            }
          } catch {
            // Process ended.
          }
        })();

        const stderrReader = execution.proc.stderr.getReader();
        const stderrTask = (async () => {
          try {
            while (true) {
              const { done, value } = await stderrReader.read();
              if (done) {
                break;
              }
              appendOutputChunk(decoder.decode(value, { stream: true }));
            }
          } catch {
            // Process ended.
          }
        })();

        const exitCode = await execution.proc.exited;
        await settleShellOutputReaders([stdoutReader, stderrReader], [stdoutTask, stderrTask]);

        const endedAtNs = Bun.nanoseconds();
        const shell = shellsRef.current.find((entry) => entry.id === shellId);
        const wasCancelled = shellCancelRequestsRef.current.has(shellId);
        const wasBackgrounded = shell?.isBackground ?? false;
        const shouldCollectMeasurement = shell?.collectMeasurement ?? true;

        shellExecutionsRef.current.delete(shellId);
        shellCancelRequestsRef.current.delete(shellId);

        if (wasCancelled) {
          if (wasBackgrounded) {
            removeShell(shellId);
          } else {
            removeShell(shellId);
            setItems((prev) => [
              ...prev,
              {
                id: nextHistoryId++,
                type: "command",
                command: input,
                output: formatCancelledCommandOutput(capturedOutput),
              },
            ]);
          }
          return;
        }

        if (wasBackgrounded && !shouldCollectMeasurement) {
          updateShell(shellId, (current) => ({
            ...current,
            status: exitCode === 0 ? "exited" : "failed",
            endedAtNs,
            exitCode,
            collectMeasurement: false,
          }));
          return;
        }

        removeShell(shellId);
        const exec = collectResult(execution, exitCode);

        insertMeasurement(currentDb, {
          command: input,
          project,
          execution: exec,
          system,
          cwd: process.cwd(),
          benchGroup: null,
        });

        setItems((prev) => [
          ...prev,
          {
            id: nextHistoryId++,
            type: "command",
            command: input,
            exec,
            output: capturedOutput || undefined,
          },
        ]);
      } catch (error) {
        removeShell(shellId);
        addInfoItem(`  Error: ${describeUnknownError(error)}`);
      }
    },
    [addInfoItem, currentDb, handleSlashCommand, project, removeShell, system, updateShell],
  );

  return (
    <Box flexDirection="column" width="100%">
      {shouldShowReplIntro(hasSubmittedCommand) && (
        <Box flexDirection="column" paddingBottom={1}>
          <Box paddingLeft={2} gap={1}>
            <Text bold>measure</Text>
            <Text>v{APP_VERSION}</Text>
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
            <Text dimColor>
              Type a one-off command to measure, or start with / for slash commands.
            </Text>
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

      {foregroundShell && (
        <Box flexDirection="column" marginBottom={1}>
          <CommandItem
            command={foregroundShell.command}
            output={foregroundShell.output || undefined}
          />
          <Box paddingLeft={2}>
            <Text dimColor>{getRunningCommandStatus(foregroundShell.status === "stopping")}</Text>
          </Box>
        </Box>
      )}

      {shellUiMode !== "picker" && shellUiMode !== "logs" && (
        <Box>
          <TextInput
            prompt={getReplPrompt(hasSubmittedCommand)}
            onSubmit={handleSubmit}
            onClear={clearScreen}
            onNavigateDownBoundary={focusShellBadge}
            active={isPromptActive}
            history={inputHistory}
            slashCommands={REPL_SLASH_COMMANDS}
          />
        </Box>
      )}

      {visibleShells.length > 0 && (
        <ShellsBox
          shells={visibleShells}
          mode={shellUiMode}
          selectedShellId={selectedShellId}
          logShell={logShell}
          logScrollOffset={logScrollOffset}
          nowNs={shellViewNowNs}
        />
      )}
    </Box>
  );
}
