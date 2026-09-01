import assert from "node:assert/strict";
import test from "node:test";

import {
  assertEquivalentExecution,
  compareMedians,
  median,
  normalizeExecutionResult,
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
