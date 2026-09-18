import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const artifactDirectory = process.argv[2]
  ? resolve(process.argv[2])
  : undefined;
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
      `${command} ${args.join(" ")} exited with ${result.status}`,
    );
  }
  return result.stdout;
}

try {
  const packOutput = run(
    npm,
    ["pack", "--json", "--pack-destination", smokeRoot],
    root,
  );
  const [{ filename }] = JSON.parse(packOutput);
  const tarball = join(smokeRoot, filename);

  writeFileSync(
    join(smokeRoot, "package.json"),
    JSON.stringify({ private: true, name: "rjest-npm-smoke" }),
  );
  run(npm, ["install", "--ignore-scripts", tarball], smokeRoot);
  run(npm, ["rebuild", "rjest-rust-runner"], smokeRoot);

  writeFileSync(
    join(smokeRoot, "smoke.test.js"),
    "test('runs from the packed npm command', () => expect(21 * 2).toBe(42));\n",
  );
  writeFileSync(
    join(smokeRoot, "hosted.test.cjs"),
    "test('loads CommonJS in a second packed suite', () => expect(require('node:path').basename('/first/second')).toBe('second'));\n",
  );

  const version = run(
    npm,
    ["exec", "--", "rjest", "--version"],
    smokeRoot,
  ).trim();
  if (version !== `rjest ${manifest.version}`) {
    throw new Error(`unexpected packed command version: ${version}`);
  }

  const resultPath = join(smokeRoot, "test-result.json");
  run(
    npm,
    [
      "exec",
      "--",
      "rjest",
      "--runInBand",
      "--json",
      `--outputFile=${resultPath}`,
    ],
    smokeRoot,
  );
  const result = JSON.parse(readFileSync(resultPath, "utf8"));
  const tests = result.testResults.flatMap((file) => file.tests);
  if (
    result.testResults.length !== 2 ||
    tests.length !== 2 ||
    tests.some((test) => test.status !== "passed")
  ) {
    throw new Error(
      "packed Rjest command did not pass both hosted smoke suites",
    );
  }

  console.log(`Packed npm smoke passed: ${version}; 2 hosted suites passed.`);
  if (artifactDirectory) {
    mkdirSync(artifactDirectory, { recursive: true });
    const artifact = join(artifactDirectory, filename);
    copyFileSync(tarball, artifact);
    console.log(`Validated package saved to ${artifact}`);
  }
  rmSync(smokeRoot, { recursive: true, force: true });
} catch (error) {
  console.error(`Packed npm smoke failed. Artifacts kept at ${smokeRoot}`);
  throw error;
}
