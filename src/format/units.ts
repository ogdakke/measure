export function formatDuration(ns: number): string {
  const ms = ns / 1_000_000;
  if (ms < 1) return `${(ns / 1_000).toFixed(1)}µs`;
  if (ms < 1_000) return `${ms.toFixed(0)}ms`;
  const s = ms / 1_000;
  if (s < 60) return `${s.toFixed(2)}s`;
  const min = Math.floor(s / 60);
  const sec = s % 60;
  return `${min}m ${sec.toFixed(1)}s`;
}

export function formatDurationMs(ms: number): string {
  return formatDuration(ms * 1_000_000);
}

export function formatMicroseconds(us: number): string {
  return formatDuration(us * 1_000);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}
