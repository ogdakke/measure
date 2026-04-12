import { Result } from "better-result";
import { dirname, basename, join } from "node:path";

export function detectProject(cwd: string): string | null {
  const fromPkg = findPackageName(cwd);
  if (fromPkg) return fromPkg;

  const fromGit = findGitProjectName(cwd);
  if (fromGit) return fromGit;

  return basename(cwd);
}

function findPackageName(dir: string): string | null {
  let current = dir;
  for (let i = 0; i < 20; i++) {
    const pkgPath = join(current, "package.json");
    const result = Result.try(() => {
      // Bun.file doesn't throw for missing files, but .json() will
      // Use a sync approach: check size first
      return JSON.parse(
        require("node:fs").readFileSync(pkgPath, "utf-8"),
      ) as Record<string, unknown>;
    });

    if (Result.isOk(result) && typeof result.value.name === "string") {
      return result.value.name;
    }

    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function findGitProjectName(dir: string): string | null {
  let current = dir;
  for (let i = 0; i < 20; i++) {
    const gitDir = join(current, ".git");
    const exists = Result.try(() =>
      require("node:fs").statSync(gitDir),
    );
    if (Result.isOk(exists)) {
      return basename(current);
    }

    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}
