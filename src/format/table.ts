import { bold, dim } from "./colors.ts";

export interface Column {
  key: string;
  label: string;
  align?: "left" | "right";
  maxWidth?: number;
}

export function renderTable(
  columns: Column[],
  rows: Record<string, string>[],
): string {
  if (rows.length === 0) return dim("  No data.");

  const widths = columns.map((col) => {
    const dataMax = rows.reduce(
      (max, row) => Math.max(max, (row[col.key] ?? "").length),
      0,
    );
    const headerWidth = col.label.length;
    const natural = Math.max(dataMax, headerWidth);
    return col.maxWidth ? Math.min(natural, col.maxWidth) : natural;
  });

  const header = columns
    .map((col, i) => pad(bold(col.label), widths[i]!, col.align ?? "left"))
    .join("  ");

  const separator = widths.map((w) => dim("─".repeat(w))).join("  ");

  const body = rows.map((row) =>
    columns
      .map((col, i) => {
        let val = row[col.key] ?? "";
        if (col.maxWidth && val.length > col.maxWidth) {
          val = val.slice(0, col.maxWidth - 1) + "…";
        }
        return pad(val, widths[i]!, col.align ?? "left");
      })
      .join("  "),
  );

  return ["  " + header, "  " + separator, ...body.map((r) => "  " + r)].join(
    "\n",
  );
}

function pad(str: string, width: number, align: "left" | "right"): string {
  // Account for ANSI escape codes in length calculation
  const visible = str.replace(/\x1b\[[0-9;]*m/g, "");
  const diff = width - visible.length;
  if (diff <= 0) return str;
  const padding = " ".repeat(diff);
  return align === "right" ? padding + str : str + padding;
}
