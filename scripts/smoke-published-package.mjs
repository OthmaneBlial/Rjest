import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const packageSpec = "rjest-rust-runner@0.1.0-alpha.1";
const smokeRoot = mkdtempSync(join(tmpdir(), "rjest-published-smoke-"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function run(args) {
  const result = spawnSync(npm, args, {
    cwd: smokeRoot,
    encoding: "utf8",
    env: process.env,
  });
  if (result.status !== 0) {
    process.stdout.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    throw new Error(`npm ${args.join(" ")} exited with ${result.status}`);
  }
  return result.stdout;
}

try {
  writeFileSync(
    join(smokeRoot, "package.json"),
    JSON.stringify({ private: true, name: "rjest-published-smoke" })
  );
  run(["install", "--save-dev", packageSpec]);

  writeFileSync(
    join(smokeRoot, "published.test.js"),
    "test('runs from the npm registry package', () => expect('rjest').toContain('jest'));\n"
  );

  const version = run(["exec", "--", "rjest", "--version"]).trim();
  if (version !== "rjest 0.1.0-alpha.1") {
    throw new Error(`unexpected published command version: ${version}`);
  }

  const testRun = run([
    "exec",
    "--",
    "rjest",
    "--runInBand",
    "published.test.js",
  ]);
  if (!testRun.includes("1 passed")) {
    throw new Error("published Rjest command did not pass the smoke suite");
  }

  console.log(`Published npm smoke passed: ${packageSpec}; 1 test passed.`);
  rmSync(smokeRoot, { recursive: true, force: true });
} catch (error) {
  console.error(`Published npm smoke failed. Artifacts kept at ${smokeRoot}`);
  throw error;
}
