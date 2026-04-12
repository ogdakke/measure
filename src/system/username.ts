import type { Database } from "bun:sqlite";
import * as readline from "node:readline";
import { basename } from "node:path";
import { homedir } from "node:os";
import { getConfig, setConfig } from "../db/queries.ts";
import { dim } from "../format/colors.ts";

const CONFIG_KEY = "username";

export function getStoredUsername(db: Database): string | null {
  return getConfig(db, CONFIG_KEY);
}

export async function ensureUsername(db: Database): Promise<string> {
  const existing = getStoredUsername(db);
  if (existing) return existing;

  const fallback = basename(homedir());
  const name = await promptUsername(fallback);
  setConfig(db, CONFIG_KEY, name);
  return name;
}

function promptUsername(fallback: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(
      `  Enter your name ${dim(`(default: ${fallback})`)}:  `,
      (answer) => {
        rl.close();
        const trimmed = answer.trim();
        resolve(trimmed || fallback);
      },
    );
  });
}
