import { describe, expect, test } from "bun:test";
import { renderTable, type Column } from "../../src/format/table.ts";

function stripAnsi(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/\x1b\[[0-9;]*m/g, "");
}

describe("renderTable", () => {
  test("normalizes embedded newlines inside cell values", () => {
    const originalColumns = process.stdout.columns;
    Object.defineProperty(process.stdout, "columns", { value: 100, configurable: true });

    try {
      const columns: Column[] = [
        { key: "id", label: "#", align: "right" },
        { key: "command", label: "Command", maxWidth: 30 },
        { key: "duration", label: "Duration", align: "right" },
      ];

      const output = renderTable(columns, [
        {
          id: "1",
          command: "echo hi\n",
          duration: "7ms",
        },
      ]);

      const lines = stripAnsi(output).split("\n");

      expect(lines).toHaveLength(3);
      expect(lines[2]).toContain("echo hi");
      expect(lines[2]).toContain("7ms");
    } finally {
      Object.defineProperty(process.stdout, "columns", {
        value: originalColumns,
        configurable: true,
      });
    }
  });
});
