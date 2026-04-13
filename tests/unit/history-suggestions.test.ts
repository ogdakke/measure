import { describe, expect, test } from "bun:test";
import {
  getHistorySearchMatches,
  getHistorySearchResults,
  getInlineHistorySuggestion,
  mergeHistorySuggestions,
  parseShellHistoryContent,
  parseShellHistoryLine,
} from "../../src/repl/history-suggestions.ts";

describe("history suggestions", () => {
  test("parses bash and zsh history lines", () => {
    expect(parseShellHistoryLine("bun test")).toBe("bun test");
    expect(parseShellHistoryLine(": 1711650000:0;git status")).toBe("git status");
    expect(parseShellHistoryLine("")).toBeNull();
  });

  test("reads shell history newest first", () => {
    const content = ["echo one", ": 1711650000:0;git status", "bun test"].join("\n");

    expect(parseShellHistoryContent(content)).toEqual(["bun test", "git status", "echo one"]);
  });

  test("merges history sources without duplicates", () => {
    expect(
      mergeHistorySuggestions([
        ["git status", "bun test"],
        ["bun test", "ls src"],
        ["git status", "pwd"],
      ]),
    ).toEqual(["git status", "bun test", "ls src", "pwd"]);
  });

  test("finds inline prefix suggestions only at the end of the line", () => {
    const suggestions = ["git status", "git stash", "bun test"];

    expect(getInlineHistorySuggestion("git st", 6, suggestions)).toBe("git status");
    expect(getInlineHistorySuggestion("git st", 3, suggestions)).toBeNull();
    expect(getInlineHistorySuggestion("/hi", 3, suggestions)).toBeNull();
  });

  test("returns recent history for an empty search and fuzzy matches for a query", () => {
    const suggestions = ["git status", "git stash", "bun test", "ls src"];

    expect(getHistorySearchMatches("", suggestions)).toEqual(suggestions);
    expect(getHistorySearchMatches("", suggestions, 3)).toEqual([
      "git status",
      "git stash",
      "bun test",
    ]);
    expect(getHistorySearchMatches("bntst", suggestions, 3)).toEqual(["bun test"]);
  });

  test("surfaces highlighted character positions for fuzzy results", () => {
    const [result] = getHistorySearchResults("gs", ["git status"]);

    expect(result?.value).toBe("git status");
    expect([...result!.positions].sort((a, b) => a - b)).toEqual([0, 4]);
  });
});
