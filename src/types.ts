export interface SystemInfo {
  os: string;
  cpuModel: string;
  cpuCores: number;
  ramBytes: number;
  hostname: string;
  username: string;
  shell: string | null;
  bunVersion: string;
}

export interface ExecutionResult {
  durationNs: number;
  exitCode: number;
  cpuUserUs: number | null;
  cpuSystemUs: number | null;
  maxRss: number | null;
}

export interface Measurement {
  id: number;
  command: string;
  project: string | null;
  durationNs: number;
  exitCode: number;
  cpuUserUs: number | null;
  cpuSystemUs: number | null;
  maxRss: number | null;
  os: string;
  cpuModel: string;
  cpuCores: number;
  ramBytes: number;
  hostname: string;
  username: string;
  cwd: string;
  shell: string | null;
  bunVersion: string;
  benchGroup: string | null;
  createdAt: string;
}

export interface BenchStats {
  count: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  stddev: number;
  p5: number;
  p95: number;
}

export interface AggregateStats {
  command: string;
  hostname: string;
  os: string;
  cpuModel: string;
  count: number;
  meanNs: number;
  medianNs: number;
  minNs: number;
  maxNs: number;
  stddevNs: number;
  successRate: number;
}

export interface ExportFilters {
  project?: string;
  command?: string;
  host?: string;
}

export type ParsedCommand =
  | { command: "repl" }
  | { command: "run"; args: string[] }
  | {
      command: "bench";
      iterations: number;
      warmup: number;
      args: string[];
    }
  | {
      command: "history";
      limit: number;
      project?: string;
      commandFilter?: string;
    }
  | { command: "stats"; project?: string; commandFilter?: string; host?: string }
  | {
      command: "export";
      format: "csv" | "json";
      project?: string;
      commandFilter?: string;
      host?: string;
      output?: string;
    }
  | { command: "system" }
  | { command: "help" }
  | { command: "version" }
  | { command: "db"; action: "list" }
  | { command: "db"; action: "create"; name: string }
  | { command: "db"; action: "use"; name: string }
  | { command: "import"; files: string[] };
