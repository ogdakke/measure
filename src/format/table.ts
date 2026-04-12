import { bold, dim } from "./colors.ts";

export interface Column {
  key: string;
  label: string;
  align?: "left" | "right";
  maxWidth?: number;
}

export function renderTable(columns: Column[], rows: Record<string, string>[]): string {
  if (rows.length === 0) return dim("  No data.");

  const termWidth = process.stdout.columns ?? 80;
  const indent = 2;
  const gap = 2; // space between columns
  const available = termWidth - indent - gap * (columns.length - 1);

  // Compute natural width each column needs (min of content vs maxWidth)
  const naturalWidths = columns.map((col) => {
    const dataMax = rows.reduce(
      (max, row) => Math.max(max, stripAnsi(row[col.key] ?? "").length),
      0,
    );
    const headerWidth = col.label.length;
    const natural = Math.max(dataMax, headerWidth);
    return col.maxWidth ? Math.min(natural, col.maxWidth) : natural;
  });

  const totalNatural = naturalWidths.reduce((a, b) => a + b, 0);

  // Distribute extra space proportionally across columns
  let widths: number[];
  if (totalNatural < available) {
    const extra = available - totalNatural;
    widths = naturalWidths.map((w) => {
      const share = Math.floor(extra * (w / totalNatural));
      return w + share;
    });
    // Give any rounding remainder to the widest column
    const allocated = widths.reduce((a, b) => a + b, 0);
    const remainder = available - allocated;
    if (remainder > 0) {
      const widestIdx = widths.indexOf(Math.max(...widths));
      widths[widestIdx]! += remainder;
    }
  } else {
    widths = naturalWidths;
  }

  const header = columns
    .map((col, i) => pad(bold(col.label), widths[i]!, col.align ?? "left"))
    .join(" ".repeat(gap));

  const separator = widths.map((w) => dim("─".repeat(w))).join(" ".repeat(gap));

  const body = rows.map((row) =>
    columns
      .map((col, i) => {
        let val = row[col.key] ?? "";
        const visLen = stripAnsi(val).length;
        if (col.maxWidth && visLen > widths[i]!) {
          val = val.slice(0, widths[i]! - 1) + "…";
        }
        return pad(val, widths[i]!, col.align ?? "left");
      })
      .join(" ".repeat(gap)),
  );

  return [
    " ".repeat(indent) + header,
    " ".repeat(indent) + separator,
    ...body.map((r) => " ".repeat(indent) + r),
  ].join("\n");
}

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

function pad(str: string, width: number, align: "left" | "right"): string {
  const visible = stripAnsi(str);
  const diff = width - visible.length;
  if (diff <= 0) return str;
  const padding = " ".repeat(diff);
  return align === "right" ? padding + str : str + padding;
}
