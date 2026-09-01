import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const smokeRoot = mkdtempSync(join(tmpdir(), "rjest-npm-smoke-"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: process.env,
  });
  if (result.status !== 0) {
    process.stdout.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    throw new Error(
      `${command} ${args.join(" ")} exited with ${result.status}`
    );
  }
  return result.stdout;
}

try {
  const packOutput = run(
    npm,
    ["pack", "--json", "--pack-destination", smokeRoot],
    root
  );
  const [{ filename }] = JSON.parse(packOutput);
  const tarball = join(smokeRoot, filename);

  writeFileSync(
    join(smokeRoot, "package.json"),
    JSON.stringify({ private: true, name: "rjest-npm-smoke" })
  );
  run(npm, ["install", "--ignore-scripts", tarball], smokeRoot);
  run(npm, ["rebuild", "rjest"], smokeRoot);

  writeFileSync(
    join(smokeRoot, "smoke.test.js"),
    "test('runs from the packed npm command', () => expect(21 * 2).toBe(42));\n"
  );

  const version = run(
    npm,
    ["exec", "--", "rjest", "--version"],
    smokeRoot
  ).trim();
  if (version !== "rjest 0.1.0-alpha.1") {
    throw new Error(`unexpected packed command version: ${version}`);
  }

  const testRun = run(
    npm,
    ["exec", "--", "rjest", "--runInBand", "smoke.test.js"],
    smokeRoot
  );
  if (!testRun.includes("1 passed")) {
    throw new Error("packed Rjest command did not pass the smoke suite");
  }

  console.log(`Packed npm smoke passed: ${version}; 1 test passed.`);
  rmSync(smokeRoot, { recursive: true, force: true });
} catch (error) {
  console.error(`Packed npm smoke failed. Artifacts kept at ${smokeRoot}`);
  throw error;
}
