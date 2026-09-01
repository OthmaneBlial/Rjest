import { execFileSync, spawn, spawnSync } from "node:child_process";
import { readFile, unlink, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { arch, cpus, platform, release, totalmem } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { generateWorkloads, generatedDir } from "./generate.mjs";
import {
  assertEquivalentExecution,
  compareMedians,
  renderMarkdown,
  summarize,
} from "./lib.mjs";

const benchmarkDir = dirname(fileURLToPath(import.meta.url));
const projectDir = dirname(benchmarkDir);
// The `jest-29` npm alias also publishes a `jest` bin and can win npm's
// `.bin/jest` symlink. Point at the pinned default package explicitly.
const jestBinary = join(projectDir, "node_modules", "jest", "bin", "jest.js");
const rjestBinary = join(projectDir, "target", "release", "rjest");
const args = parseArguments(process.argv.slice(2));

if (args.help) {
  process.stdout.write(
    `Usage: node benchmarks/run.mjs [options]\n\n` +
      `  --quick         Use one warm-up and three measured pairs\n` +
      `  --warmups=N     Override warm-up pairs (default: 2)\n` +
      `  --runs=N        Override measured pairs (default: 10)\n` +
      `  --output=PATH   Write JSON and Markdown reports to PATH\n` +
      `  --no-memory     Skip /usr/bin/time peak-RSS collection\n`,
  );
  process.exit(0);
}

for (const binary of [jestBinary, rjestBinary]) {
  if (!existsSync(binary)) {
    throw new Error(
      `missing ${relative(projectDir, binary)}; run npm ci and cargo build --release -p rjest-cli first`,
    );
  }
}

const manifest = await generateWorkloads();
const outputJson = resolveOutput(args.output);
const outputMarkdown = outputJson.replace(/\.json$/u, ".md");
await mkdir(dirname(outputJson), { recursive: true });

const verification = {};
for (const workload of manifest.workloads) {
  process.stdout.write(`Verify ${workload.name}... `);
  verification[workload.id] = await verifyWorkload(workload);
  process.stdout.write("matched\n");
}

const measuredWorkloads = [];
for (const workload of manifest.workloads) {
  process.stdout.write(
    `Measure ${workload.name}: ${args.warmups} warm-up + ${args.runs} recorded pair(s)\n`,
  );
  const samples = { jest: [], rjest: [] };
  const memory = { jest: [], rjest: [] };
  for (let cycle = -args.warmups; cycle < args.runs; cycle += 1) {
    const order = cycle % 2 === 0 ? ["jest", "rjest"] : ["rjest", "jest"];
    for (const runner of order) {
      const measurement = await measure(workload, runner, args.memory);
      if (cycle >= 0) {
        samples[runner].push(measurement.elapsedMs);
        if (measurement.peakRssBytes != null) {
          memory[runner].push(measurement.peakRssBytes);
        }
      }
    }
    process.stdout.write(
      cycle < 0 ? "  warm-up complete\n" : `  pair ${cycle + 1}/${args.runs}\n`,
    );
  }
  const runners = Object.fromEntries(
    ["jest", "rjest"].map((runner) => [
      runner,
      {
        timing: summarize(samples[runner]),
        samplesMs: samples[runner],
        peakRssBytes:
          memory[runner].length > 0 ? Math.max(...memory[runner]) : null,
        peakRssSamplesBytes: memory[runner],
      },
    ]),
  );
  const comparison = compareMedians(
    runners.jest.timing.medianMs,
    runners.rjest.timing.medianMs,
  );
  process.stdout.write(`  Rjest: ${comparison.label}\n`);
  measuredWorkloads.push({
    ...workload,
    directory: relative(projectDir, workload.directory),
    config: relative(projectDir, workload.config),
    verification: verification[workload.id],
    commands: {
      jest: displayCommand(workload, "jest"),
      rjest: displayCommand(workload, "rjest"),
    },
    comparison,
    runners,
  });
}

const gitStatus = exec("git", ["status", "--porcelain"]);
const report = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  outputJson: relative(dirname(outputJson), outputJson),
  source: {
    repository: "https://github.com/OthmaneBlial/rjest",
    commit: exec("git", ["rev-parse", "HEAD"]),
    dirty: gitStatus.length > 0,
  },
  machine: {
    label: `${cpus()[0]?.model ?? "unknown CPU"} · ${Math.round(totalmem() / 2 ** 30)} GiB`,
    cpu: cpus()[0]?.model ?? "unknown",
    logicalCpus: cpus().length,
    totalMemoryBytes: totalmem(),
    platform: platform(),
    release: release(),
    arch: arch(),
  },
  versions: {
    node: process.version,
    rust: exec("rustc", ["--version"]),
    jestPackage: JSON.parse(
      await readFile(
        join(projectDir, "node_modules", "jest", "package.json"),
        "utf8",
      ),
    ).version,
    jestCli: exec(jestBinary, ["--version"]),
    rjest: exec(rjestBinary, ["--version"]),
  },
  method: {
    warmups: args.warmups,
    runs: args.runs,
    alternatingOrder: true,
    cache: "disabled for both runners",
    memoryTool: args.memory
      ? (memoryTool()?.kind ?? "unavailable")
      : "disabled",
  },
  workloads: measuredWorkloads,
};

await writeFile(outputJson, `${JSON.stringify(report, null, 2)}\n`);
await writeFile(outputMarkdown, renderMarkdown(report));
process.stdout.write(
  `Reports written to ${relative(projectDir, outputJson)} and ${relative(projectDir, outputMarkdown)}\n`,
);

async function verifyWorkload(workload) {
  if (workload.mode === "list") {
    const lists = {};
    for (const runner of ["jest", "rjest"]) {
      const command = runnerCommand(workload, runner);
      const result = spawnSync(command.executable, command.arguments, {
        cwd: workload.directory,
        env: benchmarkEnvironment(),
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
      });
      if (result.status !== 0) throw commandFailure(workload, runner, result);
      lists[runner] = parseTestList(result.stdout);
    }
    if (lists.jest.length !== workload.expectedSuites) {
      throw new Error(
        `${workload.id}: Jest listed ${lists.jest.length} suites, expected ${workload.expectedSuites}`,
      );
    }
    if (JSON.stringify(lists.jest) !== JSON.stringify(lists.rjest)) {
      throw new Error(
        `${workload.id}: Jest and Rjest listed different test paths`,
      );
    }
    return { listedSuites: lists.jest.length, exactPathSet: true };
  }
  const results = {};
  for (const runner of ["jest", "rjest"]) {
    const resultPath = join(
      generatedDir,
      `${workload.id}-${runner}-verification.json`,
    );
    const executionMode =
      workload.mode === "parallel"
        ? [`--maxWorkers=${workload.workers}`]
        : ["--runInBand"];
    const command = runnerCommand(workload, runner, [
      ...executionMode,
      "--no-cache",
      "--ci",
      "--silent",
      "--json",
      `--outputFile=${resultPath}`,
    ]);
    const result = spawnSync(command.executable, command.arguments, {
      cwd: workload.directory,
      env: benchmarkEnvironment(),
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
    if (result.status !== 0) throw commandFailure(workload, runner, result);
    results[runner] = JSON.parse(await readFile(resultPath, "utf8"));
    await unlink(resultPath);
  }
  return assertEquivalentExecution(workload, results.jest, results.rjest);
}

async function measure(workload, runner, collectMemory) {
  const command = runnerCommand(workload, runner);
  const timer = collectMemory ? memoryTool() : undefined;
  const metricsPath = join(
    generatedDir,
    `.time-${process.pid}-${runner}-${Date.now()}`,
  );
  const executable = timer?.executable ?? command.executable;
  const arguments_ = timer
    ? [
        ...timer.arguments(metricsPath),
        command.executable,
        ...command.arguments,
      ]
    : command.arguments;
  const started = process.hrtime.bigint();
  const result = await spawnAndWait(executable, arguments_, workload.directory);
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1_000_000;
  if (result.code !== 0) throw commandFailure(workload, runner, result);
  let peakRssBytes;
  if (timer) {
    const metrics = await readFile(metricsPath, "utf8");
    peakRssBytes = timer.parse(metrics);
    await unlink(metricsPath);
  }
  return { elapsedMs, peakRssBytes };
}

function runnerCommand(workload, runner, overrideArguments) {
  const executable = runner === "jest" ? jestBinary : rjestBinary;
  const workloadArguments =
    overrideArguments ??
    (workload.mode === "list"
      ? ["--listTests", "--no-cache"]
      : workload.mode === "parallel"
        ? [`--maxWorkers=${workload.workers}`, "--no-cache", "--ci", "--silent"]
        : ["--runInBand", "--no-cache", "--ci", "--silent"]);
  return {
    executable,
    arguments: [`--config=${workload.config}`, ...workloadArguments],
  };
}

function displayCommand(workload, runner) {
  const command = runnerCommand(workload, runner);
  return [
    relative(projectDir, command.executable),
    ...command.arguments.map((argument) =>
      argument.replaceAll(projectDir, "."),
    ),
  ].join(" ");
}

function parseTestList(output) {
  const trimmed = output.trim();
  if (trimmed.startsWith("[")) {
    return JSON.parse(trimmed)
      .map((path) => resolve(path))
      .sort();
  }
  return trimmed
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((path) => resolve(path))
    .sort();
}

function memoryTool() {
  if (!existsSync("/usr/bin/time")) return undefined;
  if (platform() === "darwin") {
    return {
      kind: "macOS /usr/bin/time -l",
      executable: "/usr/bin/time",
      arguments: (output) => ["-l", "-o", output],
      parse: (output) => {
        const match = output.match(/(\d+)\s+maximum resident set size/u);
        return match ? Number(match[1]) : undefined;
      },
    };
  }
  if (platform() === "linux") {
    return {
      kind: "GNU /usr/bin/time -v",
      executable: "/usr/bin/time",
      arguments: (output) => ["-v", "-o", output],
      parse: (output) => {
        const match = output.match(
          /Maximum resident set size \(kbytes\):\s+(\d+)/u,
        );
        return match ? Number(match[1]) * 1024 : undefined;
      },
    };
  }
  return undefined;
}

function spawnAndWait(executable, arguments_, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, arguments_, {
      cwd,
      env: benchmarkEnvironment(),
      stdio: "ignore",
    });
    child.once("error", reject);
    child.once("close", (code, signal) => resolvePromise({ code, signal }));
  });
}

function benchmarkEnvironment() {
  return { ...process.env, CI: "1", FORCE_COLOR: "0", NO_COLOR: "1" };
}

function commandFailure(workload, runner, result) {
  const details = [result.stderr, result.stdout]
    .filter((value) => typeof value === "string" && value.trim())
    .join("\n");
  return new Error(
    `${runner} failed for ${workload.id} with ${result.status ?? result.code}${
      details ? `:\n${details}` : ""
    }`,
  );
}

function exec(executable, arguments_) {
  return execFileSync(executable, arguments_, {
    cwd: projectDir,
    encoding: "utf8",
  }).trim();
}

function resolveOutput(value) {
  const fallback = join(benchmarkDir, "results", "local", "latest.json");
  const output = value
    ? isAbsolute(value)
      ? value
      : join(projectDir, value)
    : fallback;
  if (!output.endsWith(".json")) throw new Error("--output must end in .json");
  return output;
}

function parseArguments(values) {
  const options = {
    warmups: 2,
    runs: 10,
    memory: true,
    output: undefined,
    help: false,
  };
  for (const value of values) {
    if (value === "--quick") {
      options.warmups = 1;
      options.runs = 3;
    } else if (value === "--no-memory") {
      options.memory = false;
    } else if (value === "--help" || value === "-h") {
      options.help = true;
    } else if (value.startsWith("--warmups=")) {
      options.warmups = positiveInteger(
        value.slice("--warmups=".length),
        "warmups",
        true,
      );
    } else if (value.startsWith("--runs=")) {
      options.runs = positiveInteger(value.slice("--runs=".length), "runs");
    } else if (value.startsWith("--output=")) {
      options.output = value.slice("--output=".length);
    } else {
      throw new Error(`unknown benchmark option: ${value}`);
    }
  }
  return options;
}

function positiveInteger(value, name, allowZero = false) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < (allowZero ? 0 : 1)) {
    throw new Error(
      `${name} must be ${allowZero ? "a non-negative" : "a positive"} integer`,
    );
  }
  return parsed;
}
