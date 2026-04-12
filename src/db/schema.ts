import type { Database } from "bun:sqlite";

const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS schema_version (
  version    INTEGER NOT NULL,
  applied_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS measurements (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  command       TEXT    NOT NULL,
  project       TEXT,
  duration_ns   INTEGER NOT NULL,
  exit_code     INTEGER NOT NULL,
  cpu_user_us   INTEGER,
  cpu_system_us INTEGER,
  max_rss       INTEGER,
  os            TEXT    NOT NULL,
  cpu_model     TEXT    NOT NULL,
  cpu_cores     INTEGER NOT NULL,
  ram_bytes     INTEGER NOT NULL,
  hostname      TEXT    NOT NULL,
  username      TEXT    NOT NULL,
  cwd           TEXT    NOT NULL,
  shell         TEXT,
  bun_version   TEXT    NOT NULL,
  bench_group   TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_measurements_command     ON measurements(command);
CREATE INDEX IF NOT EXISTS idx_measurements_project     ON measurements(project);
CREATE INDEX IF NOT EXISTS idx_measurements_created_at  ON measurements(created_at);
CREATE INDEX IF NOT EXISTS idx_measurements_bench_group ON measurements(bench_group);
CREATE INDEX IF NOT EXISTS idx_measurements_hostname    ON measurements(hostname);
`;

const migrations: Array<(db: Database) => void> = [
  // v1: initial schema
  (db) => {
    for (const statement of SCHEMA_V1.split(";")) {
      const trimmed = statement.trim();
      if (trimmed) db.run(trimmed);
    }
  },
];

export function migrate(db: Database): void {
  // Ensure schema_version table exists for version tracking
  db.run(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version    INTEGER NOT NULL,
      applied_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const row = db.query("SELECT MAX(version) as v FROM schema_version").get() as {
    v: number | null;
  } | null;
  const currentVersion = row?.v ?? 0;

  for (let i = currentVersion; i < migrations.length; i++) {
    db.transaction(() => {
      migrations[i]!(db);
      db.run("INSERT INTO schema_version (version) VALUES (?)", [i + 1]);
    })();
  }
}
