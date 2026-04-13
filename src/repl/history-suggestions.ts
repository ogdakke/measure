import { Fzf, type FzfResultItem } from "fzf";
import { homedir } from "node:os";
import { join } from "node:path";

const DEFAULT_SOURCE_LIMIT = 400;
const DEFAULT_MERGED_LIMIT = 1_000;

export function parseShellHistoryLine(line: string): string | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (trimmed.startsWith(":")) {
    const separatorIndex = trimmed.indexOf(";");
    if (separatorIndex !== -1) {
      const command = trimmed.slice(separatorIndex + 1).trim();
      return command.length > 0 ? command : null;
    }
  }

  return trimmed;
}

export function parseShellHistoryContent(
  content: string,
  limit = DEFAULT_SOURCE_LIMIT,
): string[] {
  const lines = content.split(/\r?\n/);
  const commands: string[] = [];

  for (let index = lines.length - 1; index >= 0 && commands.length < limit; index -= 1) {
    const command = parseShellHistoryLine(lines[index] ?? "");
    if (command) {
      commands.push(command);
    }
  }

  return commands;
}

export function mergeHistorySuggestions(
  sources: string[][],
  limit = DEFAULT_MERGED_LIMIT,
): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const source of sources) {
    for (const value of source) {
      const command = value.trim();
      if (!command || seen.has(command)) {
        continue;
      }

      seen.add(command);
      merged.push(command);

      if (merged.length >= limit) {
        return merged;
      }
    }
  }

  return merged;
}

export function getInlineHistorySuggestion(
  value: string,
  cursor: number,
  suggestions: string[],
): string | null {
  if (cursor !== value.length || value.trim().length === 0 || value.startsWith("/")) {
    return null;
  }

  const normalized = value.toLowerCase();
  for (const suggestion of suggestions) {
    if (suggestion.length <= value.length) {
      continue;
    }

    if (suggestion.toLowerCase().startsWith(normalized)) {
      return suggestion;
    }
  }

  return null;
}

export function getHistorySearchMatches(
  query: string,
  suggestions: string[],
  limit?: number,
): string[] {
  return getHistorySearchResults(query, suggestions, limit).map((match) => match.value);
}

export interface HistorySearchResult {
  value: string;
  positions: Set<number>;
}

export interface HistorySearchIndex {
  find: (query: string, limit?: number) => HistorySearchResult[];
}

export function getHistorySearchResults(
  query: string,
  suggestions: string[],
  limit?: number,
): HistorySearchResult[] {
  return createHistorySearchIndex(suggestions).find(query, limit);
}

export function createHistorySearchIndex(suggestions: string[]): HistorySearchIndex {
  const finder = new Fzf(suggestions);

  return {
    find(query: string, limit?: number): HistorySearchResult[] {
      return getHistorySearchResultsWithIndex(query, suggestions, finder, limit);
    },
  };
}

function getHistorySearchResultsWithIndex(
  query: string,
  suggestions: string[],
  finder: Fzf<string[]>,
  limit?: number,
): HistorySearchResult[] {
  if (query.trim().length === 0) {
    const values = limit == null ? [...suggestions] : suggestions.slice(0, limit);
    return values.map((value) => ({ value, positions: new Set<number>() }));
  }

  const normalized = query.toLowerCase();
  const prefixMatches = suggestions
    .filter((suggestion) => suggestion.toLowerCase().startsWith(normalized))
    .map((value) => ({
      value,
      positions: new Set<number>(Array.from({ length: query.length }, (_, index) => index)),
    }));
  const fuzzyMatches = finder.find(query).map((entry) => mapFzfResult(entry));

  return mergeHistorySearchResults(
    [prefixMatches, fuzzyMatches],
    limit ?? suggestions.length,
  );
}

export async function loadShellHistorySuggestions(limit = DEFAULT_SOURCE_LIMIT): Promise<string[]> {
  const files = getShellHistoryFiles();
  const histories: string[][] = [];

  for (const path of files) {
    try {
      const content = await Bun.file(path).text();
      histories.push(parseShellHistoryContent(content, limit));
    } catch {
      // Ignore missing or unreadable shell history files.
    }
  }

  return mergeHistorySuggestions(histories, limit * files.length);
}

function getShellHistoryFiles(): string[] {
  const historyFiles = new Set<string>();
  const userHome = homedir();
  const histFile = process.env.HISTFILE?.trim();

  if (histFile) {
    historyFiles.add(histFile);
  }

  historyFiles.add(join(userHome, ".zsh_history"));
  historyFiles.add(join(userHome, ".bash_history"));

  return [...historyFiles];
}

function mapFzfResult(entry: FzfResultItem<string>): HistorySearchResult {
  return {
    value: entry.item,
    positions: entry.positions,
  };
}

function mergeHistorySearchResults(
  sources: HistorySearchResult[][],
  limit: number,
): HistorySearchResult[] {
  const seen = new Set<string>();
  const merged: HistorySearchResult[] = [];

  for (const source of sources) {
    for (const value of source) {
      if (seen.has(value.value)) {
        continue;
      }

      seen.add(value.value);
      merged.push(value);

      if (merged.length >= limit) {
        return merged;
      }
    }
  }

  return merged;
}
