import { test, expect, describe } from "bun:test";
import { detectProject } from "../../src/system/project.ts";

describe("detectProject", () => {
  test("detects project name from package.json in cwd", () => {
    const result = detectProject(process.cwd());
    expect(result).toBe("@ogdakke/measure");
  });

  test("falls back to directory name for non-project dirs", () => {
    const result = detectProject("/tmp");
    expect(result).toBe("tmp");
  });
});
