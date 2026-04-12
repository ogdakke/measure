import { describe, expect, test } from "bun:test";
import {
  findReplSlashCommand,
  formatReplSlashCommandHelpLines,
  getReplSlashCommandMatches,
  getReplSlashCommandPrefill,
  getReplSlashCommandQuery,
  getReplSlashCommandSubmitValue,
  parseReplSlashCommand,
} from "../../src/repl/slash-commands.ts";

describe("slash commands", () => {
  test("parses slash commands and arguments", () => {
    const result = parseReplSlashCommand("/history 25");

    expect(result.command?.key).toBe("history");
    expect(result.args).toEqual(["25"]);
  });

  test("resolves aliases to their primary command", () => {
    expect(findReplSlashCommand("/quit")?.key).toBe("exit");
  });

  test("shows all commands when only slash is typed", () => {
    const matches = getReplSlashCommandMatches("/");

    expect(matches.length).toBeGreaterThan(5);
    expect(matches[0]?.command.command).toBe("/help");
  });

  test("filters matches by prefix", () => {
    const matches = getReplSlashCommandMatches("/ex");

    expect(matches.map((match) => match.command.command)).toEqual(["/export", "/exit"]);
  });

  test("only opens the menu while typing the command token", () => {
    expect(getReplSlashCommandQuery("echo test")).toBeNull();
    expect(getReplSlashCommandQuery("/import data.csv")).toBeNull();
    expect(getReplSlashCommandQuery("/im")).toBe("/im");
  });

  test("returns prefill values for commands that can take input", () => {
    const command = findReplSlashCommand("/import");

    expect(command).not.toBeNull();
    expect(getReplSlashCommandPrefill(command!)).toBe("/import ");
    expect(getReplSlashCommandSubmitValue(command!)).toBeNull();
  });

  test("allows immediate submit for commands without required input", () => {
    const command = findReplSlashCommand("/stats");

    expect(command).not.toBeNull();
    expect(getReplSlashCommandSubmitValue(command!)).toBe("/stats");
  });

  test("formats help lines with slash command labels", () => {
    const lines = formatReplSlashCommandHelpLines();

    expect(lines.some((line) => line.includes("/history [N]"))).toBe(true);
    expect(lines.some((line) => line.includes("/exit | /quit"))).toBe(true);
  });
});
