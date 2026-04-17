import { describe, it, expect } from "vitest";
import { spawnSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "../../");
const binaryPath = resolve(projectRoot, "bin/forja");
const currentVersion = readFileSync(resolve(projectRoot, "VERSION"), "utf-8").trim();

describe("forja CLI binary — version E2E", () => {
  it("node bin/forja --version outputs the current version", () => {
    const result = spawnSync("node", [binaryPath, "--version"], {
      cwd: projectRoot,
      encoding: "utf-8",
    });

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(currentVersion);
  });

  it("node bin/forja --help exits with code 0 (smoke test)", () => {
    const result = spawnSync("node", [binaryPath, "--help"], {
      cwd: projectRoot,
      encoding: "utf-8",
    });

    expect(result.status).toBe(0);
  });
});
