export type ReplSlashCommandArgMode = "none" | "optional" | "required";

export interface ReplSlashCommand {
  key: "help" | "history" | "stats" | "export" | "import" | "db" | "system" | "clear" | "exit";
  command: string;
  aliases?: string[];
  helpLabel: string;
  description: string;
  argMode: ReplSlashCommandArgMode;
}

export const REPL_SLASH_COMMANDS: ReplSlashCommand[] = [
  {
    key: "help",
    command: "/help",
    helpLabel: "/help",
    description: "Show available slash commands",
    argMode: "none",
  },
  {
    key: "history",
    command: "/history",
    helpLabel: "/history [N]",
    description: "Show last N measurements (default 10)",
    argMode: "optional",
  },
  {
    key: "stats",
    command: "/stats",
    helpLabel: "/stats",
    description: "Show aggregated stats",
    argMode: "none",
  },
  {
    key: "export",
    command: "/export",
    helpLabel: "/export [csv|json] [file]",
    description: "Export measurements to a file",
    argMode: "optional",
  },
  {
    key: "import",
    command: "/import",
    helpLabel: "/import <files...>",
    description: "Import .db, .csv, or .json files",
    argMode: "required",
  },
  {
    key: "db",
    command: "/db",
    helpLabel: "/db [list|create|use] [name]",
    description: "Manage databases",
    argMode: "optional",
  },
  {
    key: "system",
    command: "/system",
    helpLabel: "/system",
    description: "Show system info",
    argMode: "none",
  },
  {
    key: "clear",
    command: "/clear",
    helpLabel: "/clear",
    description: "Clear the screen",
    argMode: "none",
  },
  {
    key: "exit",
    command: "/exit",
    aliases: ["/quit"],
    helpLabel: "/exit | /quit",
    description: "Exit the REPL",
    argMode: "none",
  },
];

export interface ReplSlashCommandMatch {
  command: ReplSlashCommand;
  matchedName: string;
}

const REPL_SLASH_COMMAND_DESCRIPTION_GAP = 4;

export function getReplSlashCommandHelpLabelWidth(
  commands: ReplSlashCommand[] = REPL_SLASH_COMMANDS,
): number {
  return (
    Math.max(...commands.map((command) => command.helpLabel.length)) +
    REPL_SLASH_COMMAND_DESCRIPTION_GAP
  );
}

export function formatReplSlashCommandHelpLabel(
  helpLabel: string,
  commands: ReplSlashCommand[] = REPL_SLASH_COMMANDS,
): string {
  return helpLabel.padEnd(getReplSlashCommandHelpLabelWidth(commands));
}

export function getReplSlashCommandHelpLabelPadding(
  helpLabel: string,
  commands: ReplSlashCommand[] = REPL_SLASH_COMMANDS,
): string {
  return " ".repeat(getReplSlashCommandHelpLabelWidth(commands) - helpLabel.length);
}

export function formatReplSlashCommandHelpLines(): string[] {
  return REPL_SLASH_COMMANDS.map(
    (command) => `  ${formatReplSlashCommandHelpLabel(command.helpLabel)}${command.description}`,
  );
}

export function parseReplSlashCommand(input: string): {
  command: ReplSlashCommand | null;
  args: string[];
} {
  const [name, ...args] = input.trim().split(/\s+/);
  const command = findReplSlashCommand(name);
  return { command, args };
}

export function findReplSlashCommand(name: string): ReplSlashCommand | null {
  const normalized = name.toLowerCase();
  for (const command of REPL_SLASH_COMMANDS) {
    if (command.command === normalized) {
      return command;
    }
    if (command.aliases?.includes(normalized)) {
      return command;
    }
  }
  return null;
}

export function getReplSlashCommandQuery(input: string): string | null {
  const trimmed = input.trimStart();
  if (!trimmed.startsWith("/")) {
    return null;
  }

  if (/\s/.test(trimmed)) {
    return null;
  }

  return trimmed.toLowerCase();
}

export function getReplSlashCommandMatches(
  query: string,
  commands: ReplSlashCommand[] = REPL_SLASH_COMMANDS,
): ReplSlashCommandMatch[] {
  return commands.flatMap((command) => {
    const names = [command.command, ...(command.aliases ?? [])];
    const matchedName = names.find((name) => name.startsWith(query));

    if (!matchedName) {
      return [];
    }

    return [{ command, matchedName }];
  });
}

export function getReplSlashCommandPrefill(command: ReplSlashCommand): string {
  return command.command + (command.argMode === "none" ? "" : " ");
}

export function getReplSlashCommandSubmitValue(command: ReplSlashCommand): string | null {
  if (command.argMode === "required") {
    return null;
  }

  return command.command;
}
