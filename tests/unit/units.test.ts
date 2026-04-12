import { test, expect, describe } from "bun:test";
import { formatDuration, formatBytes } from "../../src/format/units.ts";

describe("formatDuration", () => {
  test("formats nanoseconds as microseconds", () => {
    expect(formatDuration(500)).toBe("0.5µs");
  });

  test("formats milliseconds", () => {
    expect(formatDuration(5_000_000)).toBe("5ms");
    expect(formatDuration(150_000_000)).toBe("150ms");
  });

  test("formats seconds", () => {
    expect(formatDuration(1_500_000_000)).toBe("1.50s");
    expect(formatDuration(12_345_000_000)).toBe("12.35s");
  });

  test("formats minutes", () => {
    expect(formatDuration(90_000_000_000)).toBe("1m 30.0s");
  });
});

describe("formatBytes", () => {
  test("formats bytes", () => {
    expect(formatBytes(500)).toBe("500 B");
  });

  test("formats kilobytes", () => {
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  test("formats megabytes", () => {
    expect(formatBytes(256 * 1024 * 1024)).toBe("256.0 MB");
  });

  test("formats gigabytes", () => {
    expect(formatBytes(16 * 1024 * 1024 * 1024)).toBe("16.0 GB");
  });
});
