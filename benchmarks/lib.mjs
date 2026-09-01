import { basename } from "node:path";

export function median(values) {
  if (values.length === 0)
    throw new Error("cannot compute a median without samples");
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function summarize(samples) {
  if (samples.length === 0) throw new Error("cannot summarize an empty sample");
  const meanMs =
    samples.reduce((total, value) => total + value, 0) / samples.length;
  const variance =
    samples.reduce((total, value) => total + (value - meanMs) ** 2, 0) /
    samples.length;
  return {
    samples: samples.length,
    medianMs: median(samples),
    meanMs,
    minMs: Math.min(...samples),
    maxMs: Math.max(...samples),
    standardDeviationMs: Math.sqrt(variance),
  };
}

export function compareMedians(jestMedianMs, rjestMedianMs) {
  if (!(jestMedianMs > 0) || !(rjestMedianMs > 0)) {
    throw new Error("benchmark medians must be positive");
  }
  const speedup = jestMedianMs / rjestMedianMs;
  return {
    speedup,
    winner: speedup > 1 ? "rjest" : speedup < 1 ? "jest" : "tie",
    label:
      speedup > 1
        ? `${formatRatio(speedup)}x faster`
        : speedup < 1
          ? `${formatRatio(1 / speedup)}x slower`
          : "same median",
  };
}

export function formatDuration(milliseconds) {
  if (milliseconds < 1) return `${milliseconds.toFixed(2)} ms`;
  if (milliseconds < 1_000) return `${milliseconds.toFixed(1)} ms`;
  return `${(milliseconds / 1_000).toFixed(2)} s`;
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "n/a";
  const mebibytes = bytes / (1024 * 1024);
  return `${mebibytes.toFixed(0)} MiB`;
}

export function normalizeExecutionResult(result) {
  if (Number.isInteger(result.numTotalTestSuites)) {
    return {
      suites: result.numTotalTestSuites,
      tests: result.numTotalTests,
      passed: result.numPassedTests,
      failed: result.numFailedTests,
      fileErrors: result.numRuntimeErrorTestSuites ?? 0,
    };
  }
  const testResults = result.testResults ?? result.test_results;
  if (Array.isArray(testResults)) {
    const tests = testResults.flatMap((file) => file.tests ?? []);
    return {
      suites: testResults.length,
      tests: tests.length,
      passed: tests.filter((test) => test.status === "passed").length,
      failed: tests.filter((test) => test.status === "failed").length,
      fileErrors: testResults.reduce(
        (total, file) => total + (file.errors?.length ?? 0),
        0,
      ),
    };
  }
  throw new Error("unrecognized test-result JSON shape");
}

export function assertEquivalentExecution(workload, jestResult, rjestResult) {
  const official = normalizeExecutionResult(jestResult);
  const candidate = normalizeExecutionResult(rjestResult);
  for (const [key, expected] of Object.entries({
    suites: workload.expectedSuites,
    tests: workload.expectedTests,
    passed: workload.expectedTests,
    failed: 0,
    fileErrors: 0,
  })) {
    if (official[key] !== expected) {
      throw new Error(
        `${workload.id}: Jest ${key} was ${official[key]}, expected ${expected}`,
      );
    }
    if (candidate[key] !== expected) {
      throw new Error(
        `${workload.id}: Rjest ${key} was ${candidate[key]}, expected ${expected}`,
      );
    }
  }
  return { jest: official, rjest: candidate };
}

export function renderMarkdown(report) {
  const lines = [
    `# Rjest performance report: ${report.machine.label}`,
    "",
    `Captured ${report.capturedAt} from commit \`${report.source.commit}\` with a ${
      report.source.dirty ? "dirty" : "clean"
    } worktree.`,
    "",
    "> These are controlled results for the workloads and machine below, not a claim that Rjest is universally faster than Jest.",
    "",
    "## Result",
    "",
    "| Workload | What it isolates | Jest median | Rjest median | Rjest vs Jest | Jest peak RSS | Rjest peak RSS |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const workload of report.workloads) {
    const comparison = compareMedians(
      workload.runners.jest.timing.medianMs,
      workload.runners.rjest.timing.medianMs,
    );
    lines.push(
      `| ${workload.name} | ${workload.description} | ${formatDuration(
        workload.runners.jest.timing.medianMs,
      )} | ${formatDuration(workload.runners.rjest.timing.medianMs)} | **${
        comparison.label
      }** | ${formatBytes(workload.runners.jest.peakRssBytes)} | ${formatBytes(
        workload.runners.rjest.peakRssBytes,
      )} |`,
    );
  }
  lines.push(
    "",
    "Peak RSS is the maximum value reported by `/usr/bin/time` across measured runs when that tool is supported. It is not a sum of every concurrently live worker.",
    "",
    "## Variability",
    "",
    "| Workload | Jest mean and spread | Rjest mean and spread |",
    "| --- | ---: | ---: |",
  );
  for (const workload of report.workloads) {
    lines.push(
      `| ${workload.name} | ${formatSpread(workload.runners.jest.timing)} | ${formatSpread(workload.runners.rjest.timing)} |`,
    );
  }
  lines.push(
    "",
    "Spread is the population standard deviation followed by the observed minimum–maximum range. The relative result above is Jest median divided by Rjest median.",
    "",
    "## Method",
    "",
    `- ${report.method.warmups} warm-up pair(s), then ${report.method.runs} measured pair(s) per workload.`,
    "- Runner order alternates on every pair to reduce ordering and thermal bias.",
    "- Both runners use the pinned dependency graph, disabled transform caches, CI mode, and equivalent worker counts.",
    "- A correctness preflight must match suite, test, pass, failure, and file-error counts before timing starts.",
    "- Wall time includes CLI startup, discovery, execution, reporting, and shutdown.",
    "",
    "## Environment",
    "",
    `- Machine: ${report.machine.label}`,
    `- OS: ${report.machine.platform} ${report.machine.release} (${report.machine.arch})`,
    `- Memory: ${formatBytes(report.machine.totalMemoryBytes)}`,
    `- Node: ${report.versions.node}`,
    `- Rust: ${report.versions.rust}`,
    `- Jest package: ${report.versions.jestPackage} (CLI reports ${report.versions.jestCli})`,
    `- Rjest: ${report.versions.rjest}`,
    "",
    "## Commands",
    "",
  );
  for (const workload of report.workloads) {
    lines.push(
      `### ${workload.name}`,
      "",
      "```sh",
      workload.commands.jest,
      workload.commands.rjest,
      "```",
      "",
    );
  }
  lines.push(
    "## Reproduce",
    "",
    "```sh",
    "npm ci",
    "cargo build --release -p rjest-cli",
    "npm run benchmark",
    "```",
    "",
    `Raw timing samples and exact metadata: [${basename(report.outputJson)}](./${basename(
      report.outputJson,
    )})`,
    "",
  );
  return lines.join("\n");
}

function formatRatio(value) {
  return value >= 10 ? value.toFixed(1) : value.toFixed(2);
}

function formatSpread(timing) {
  return `${formatDuration(timing.meanMs)} mean · σ ${formatDuration(timing.standardDeviationMs)} · ${formatDuration(timing.minMs)}–${formatDuration(timing.maxMs)}`;
}
