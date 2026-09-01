import assert from "node:assert/strict";
import test from "node:test";

import {
  assertEquivalentExecution,
  compareMedians,
  median,
  normalizeExecutionResult,
  renderMarkdown,
  summarize,
} from "./lib.mjs";

test("summarizes timing samples deterministically", () => {
  assert.equal(median([9, 1, 4, 2]), 3);
  assert.deepEqual(summarize([1, 2, 3]), {
    samples: 3,
    medianMs: 2,
    meanMs: 2,
    minMs: 1,
    maxMs: 3,
    standardDeviationMs: Math.sqrt(2 / 3),
  });
});

test("describes both speed wins and regressions", () => {
  assert.deepEqual(compareMedians(200, 50), {
    speedup: 4,
    winner: "rjest",
    label: "4.00x faster",
  });
  assert.deepEqual(compareMedians(50, 200), {
    speedup: 0.25,
    winner: "jest",
    label: "4.00x slower",
  });
});

test("normalizes native Rjest and Jest JSON summaries", () => {
  const rjest = normalizeExecutionResult({
    testResults: [
      {
        tests: [{ status: "passed" }, { status: "failed" }],
        errors: ["broken file"],
      },
    ],
  });
  const jest = normalizeExecutionResult({
    numTotalTestSuites: 1,
    numTotalTests: 2,
    numPassedTests: 1,
    numFailedTests: 1,
    numRuntimeErrorTestSuites: 1,
  });
  assert.deepEqual(rjest, jest);
});

test("rejects a timing fixture before measurement when parity is absent", () => {
  const workload = { id: "probe", expectedSuites: 1, expectedTests: 1 };
  const jest = {
    numTotalTestSuites: 1,
    numTotalTests: 1,
    numPassedTests: 1,
    numFailedTests: 0,
  };
  const rjest = {
    testResults: [{ tests: [{ status: "failed" }], errors: [] }],
  };
  assert.throws(
    () => assertEquivalentExecution(workload, jest, rjest),
    /Rjest passed was 0, expected 1/u,
  );
});

test("renders median claims with visible variability and exact version metadata", () => {
  const timing = {
    samples: 3,
    medianMs: 100,
    meanMs: 110,
    minMs: 90,
    maxMs: 140,
    standardDeviationMs: 20,
  };
  const report = {
    capturedAt: "2026-09-01T00:00:00.000Z",
    source: { commit: "abc123", dirty: false },
    machine: {
      label: "Test machine",
      platform: "test-os",
      release: "1",
      arch: "arm64",
      totalMemoryBytes: 1024 * 1024,
    },
    versions: {
      node: "v25.9.0",
      rust: "rustc 1.95.0",
      jestPackage: "30.5.0",
      jestCli: "30.4.2",
      rjest: "rjest 0.1.0-alpha.1",
    },
    method: { warmups: 2, runs: 3 },
    workloads: [
      {
        name: "Probe",
        description: "one deterministic probe",
        commands: { jest: "jest probe", rjest: "rjest probe" },
        runners: {
          jest: { timing, peakRssBytes: 2 * 1024 * 1024 },
          rjest: {
            timing: { ...timing, medianMs: 50 },
            peakRssBytes: 1024 * 1024,
          },
        },
      },
    ],
    outputJson: "report.json",
  };
  const markdown = renderMarkdown(report);
  assert.match(markdown, /2\.00x faster/u);
  assert.match(markdown, /## Variability/u);
  assert.match(markdown, /110\.0 ms mean · σ 20\.0 ms · 90\.0 ms–140\.0 ms/u);
  assert.match(markdown, /Jest package: 30\.5\.0 \(CLI reports 30\.4\.2\)/u);
});
