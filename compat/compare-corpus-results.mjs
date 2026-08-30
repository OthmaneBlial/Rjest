import {readFileSync} from 'node:fs';
import {relative, resolve} from 'node:path';

const {compareSkippedByFileCount, officialPath, rjestPath, root} = parseArguments(
  process.argv.slice(2),
);
const official = JSON.parse(readFileSync(officialPath, 'utf8'));
const rjest = JSON.parse(readFileSync(rjestPath, 'utf8'));

const officialResult = normalizeOfficial(official);
const rjestResult = normalizeRjest(rjest);
const suitePathsExact = same(officialResult.suites, rjestResult.suites);
const testsExact = same(officialResult.tests, rjestResult.tests);
const executedTestsExact = same(
  executedTests(officialResult.tests),
  executedTests(rjestResult.tests),
);
const skippedTestsExact = same(
  skippedTests(officialResult.tests),
  skippedTests(rjestResult.tests),
);
const skippedCountsExact = same(
  skippedCountsByFile(officialResult.tests),
  skippedCountsByFile(rjestResult.tests),
);
const identityStatusParity = multisetParity(
  officialResult.tests,
  rjestResult.tests,
  test => JSON.stringify([test.file, test.fullName, test.status]),
);
const identityParity = multisetParity(
  officialResult.tests,
  rjestResult.tests,
  test => JSON.stringify([test.file, test.fullName]),
);
const identityStatusDifferences = multisetDifferences(
  officialResult.tests,
  rjestResult.tests,
  test => JSON.stringify([test.file, test.fullName, test.status]),
  key => {
    const [file, fullName, status] = JSON.parse(key);
    return {file, fullName, status};
  },
);
const testsCompatible =
  testsExact ||
  (compareSkippedByFileCount && executedTestsExact && skippedCountsExact);
const snapshotsExact = same(officialResult.snapshots, rjestResult.snapshots);
const coverage = compareCoverage(official.coverageMap ?? {}, rjest.coverageMap ?? {});

const compatible =
  suitePathsExact &&
  testsCompatible &&
  snapshotsExact &&
  rjestResult.fileErrors.length === 0 &&
  coverage.filesExact &&
  coverage.aggregateExact &&
  coverage.perFileExact;

const report = {
  compatible,
  suites: {
    official: officialResult.suites.length,
    rjest: rjestResult.suites.length,
    pathsExact: suitePathsExact,
    statusCounts: {
      official: statusCounts(officialResult.suiteStatuses),
      rjest: statusCounts(rjestResult.suiteStatuses),
    },
  },
  tests: {
    official: officialResult.tests.length,
    rjest: rjestResult.tests.length,
    statusCounts: {
      official: statusCounts(officialResult.tests.map(test => test.status)),
      rjest: statusCounts(rjestResult.tests.map(test => test.status)),
    },
    namesAndStatusesExact: testsExact,
    executedNamesAndStatusesExact: executedTestsExact,
    skippedNamesAndStatusesExact: skippedTestsExact,
    skippedCountsByFileExact: skippedCountsExact,
    identityParity,
    identityStatusParity,
    identityStatusDifferences,
    compatible: testsCompatible,
    skippedComparison: compareSkippedByFileCount
      ? 'per-file-count'
      : 'name-and-status',
  },
  snapshots: {
    official: officialResult.snapshots,
    rjest: rjestResult.snapshots,
    exact: snapshotsExact,
  },
  rjestFileErrors: rjestResult.fileErrors,
  coverage,
};

console.log(JSON.stringify(report, null, 2));
if (!compatible) process.exitCode = 1;

function parseArguments(args) {
  let comparisonRoot;
  let compareSkippedByFileCount = false;
  const paths = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--root') {
      comparisonRoot = resolve(args[index + 1]);
      index += 1;
    } else if (args[index] === '--compare-skipped-by-file-count') {
      compareSkippedByFileCount = true;
    } else {
      paths.push(args[index]);
    }
  }
  if (paths.length !== 2) {
    console.error(
      'Usage: node compat/compare-corpus-results.mjs [--root <project>] [--compare-skipped-by-file-count] <jest.json> <rjest.json>',
    );
    process.exit(2);
  }
  return {
    compareSkippedByFileCount,
    officialPath: resolve(paths[0]),
    rjestPath: resolve(paths[1]),
    root: comparisonRoot,
  };
}

function executedTests(tests) {
  return tests.filter(test => test.status !== 'skipped');
}

function skippedTests(tests) {
  return tests.filter(test => test.status === 'skipped');
}

function skippedCountsByFile(tests) {
  const counts = new Map();
  for (const test of skippedTests(tests)) {
    counts.set(test.file, (counts.get(test.file) ?? 0) + 1);
  }
  return [...counts].map(([file, count]) => ({file, count})).sort((left, right) =>
    left.file.localeCompare(right.file),
  );
}

function normalizeOfficial(result) {
  const suites = result.testResults.map(file => normalizePath(file.name)).sort();
  const suiteStatuses = result.testResults.map(file =>
    suiteStatus(
      file.assertionResults,
      Boolean(file.failureMessage ?? file.testExecError),
    ),
  );
  const tests = result.testResults
    .flatMap(file =>
      file.assertionResults.map(test => ({
        file: normalizePath(file.name),
        fullName: test.fullName,
        status: normalizeStatus(test.status),
      })),
    )
    .sort(compareTests);
  return {
    suites,
    suiteStatuses,
    tests,
    snapshots: {
      added: result.snapshot?.added ?? 0,
      matched: result.snapshot?.matched ?? 0,
      removed: result.snapshot?.filesRemoved ?? 0,
      unmatched: result.snapshot?.unmatched ?? 0,
      updated: result.snapshot?.updated ?? 0,
    },
    fileErrors: [],
  };
}

function normalizeRjest(result) {
  const snapshots = {added: 0, matched: 0, removed: 0, unmatched: 0, updated: 0};
  const fileErrors = [];
  for (const file of result.testResults) {
    for (const key of Object.keys(snapshots)) snapshots[key] += file.snapshot?.[key] ?? 0;
    if (file.errors?.length) {
      fileErrors.push({file: normalizePath(file.testPath), count: file.errors.length});
    }
  }
  return {
    suites: result.testResults.map(file => normalizePath(file.testPath)).sort(),
    suiteStatuses: result.testResults.map(file =>
      suiteStatus(file.tests, Boolean(file.errors?.length)),
    ),
    tests: result.testResults
      .flatMap(file =>
        file.tests.map(test => ({
          file: normalizePath(file.testPath),
          fullName: test.fullName,
          status: normalizeStatus(test.status),
        })),
      )
      .sort(compareTests),
    snapshots,
    fileErrors,
  };
}

function compareCoverage(officialCoverage, rjestCoverage) {
  const official = summarizeCoverage(officialCoverage);
  const rjest = summarizeCoverage(rjestCoverage);
  const officialFiles = [...official.keys()].sort();
  const rjestFiles = [...rjest.keys()].sort();
  const differingFiles = [...new Set([...officialFiles, ...rjestFiles])].filter(
    file => !same(official.get(file), rjest.get(file)),
  );
  const officialAggregate = aggregateCoverage(official.values());
  const rjestAggregate = aggregateCoverage(rjest.values());
  return {
    files: {official: official.size, rjest: rjest.size},
    filesExact: same(officialFiles, rjestFiles),
    aggregate: {official: officialAggregate, rjest: rjestAggregate},
    aggregateExact: same(officialAggregate, rjestAggregate),
    perFileExact: differingFiles.length === 0,
    differingFiles,
  };
}

function summarizeCoverage(coverage) {
  return new Map(
    Object.entries(coverage).map(([file, data]) => [
      normalizePath(file),
      {
        statements: summarizeCounts(Object.values(data.s ?? {})),
        branches: summarizeCounts(Object.values(data.b ?? {}).flat()),
        functions: summarizeCounts(Object.values(data.f ?? {})),
        lines: summarizeCounts(Object.values(lineCoverage(data))),
      },
    ]),
  );
}

function lineCoverage(data) {
  const lines = {};
  for (const [id, count] of Object.entries(data.s ?? {})) {
    const line = data.statementMap?.[id]?.start?.line;
    if (line !== undefined && (lines[line] === undefined || lines[line] < count)) {
      lines[line] = count;
    }
  }
  return lines;
}

function summarizeCounts(counts) {
  return {covered: counts.filter(count => count > 0).length, total: counts.length};
}

function aggregateCoverage(summaries) {
  const aggregate = {
    statements: {covered: 0, total: 0},
    branches: {covered: 0, total: 0},
    functions: {covered: 0, total: 0},
    lines: {covered: 0, total: 0},
  };
  for (const summary of summaries) {
    for (const metric of Object.keys(aggregate)) {
      aggregate[metric].covered += summary[metric].covered;
      aggregate[metric].total += summary[metric].total;
    }
  }
  return aggregate;
}

function normalizePath(path) {
  const absolute = resolve(path);
  if (!root) return absolute.replaceAll('\\', '/');
  const local = relative(root, absolute).replaceAll('\\', '/');
  return local.startsWith('../') ? absolute.replaceAll('\\', '/') : local;
}

function normalizeStatus(status) {
  return status === 'pending' || status === 'disabled' ? 'skipped' : status;
}

function suiteStatus(tests, hasFileError) {
  const statuses = tests.map(test => normalizeStatus(test.status));
  if (hasFileError || statuses.includes('failed')) return 'failed';
  if (
    statuses.length > 0 &&
    statuses.every(status => status === 'skipped' || status === 'todo')
  ) {
    return 'skipped';
  }
  return 'passed';
}

function statusCounts(statuses) {
  const counts = {passed: 0, failed: 0, skipped: 0, todo: 0};
  for (const status of statuses) {
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}

function compareTests(left, right) {
  return `${left.file}\0${left.fullName}\0${left.status}`.localeCompare(
    `${right.file}\0${right.fullName}\0${right.status}`,
  );
}

function multisetParity(left, right, keyOf) {
  const leftCounts = countBy(left, keyOf);
  const rightCounts = countBy(right, keyOf);
  let matching = 0;
  for (const [key, count] of leftCounts) {
    matching += Math.min(count, rightCounts.get(key) ?? 0);
  }
  const total = Math.max(left.length, right.length);
  return {
    matching,
    total,
    percentage:
      total === 0 ? 100 : Math.round((matching / total) * 100_000) / 1_000,
  };
}

function countBy(values, keyOf) {
  const counts = new Map();
  for (const value of values) {
    const key = keyOf(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function multisetDifferences(left, right, keyOf, valueOf) {
  const leftCounts = countBy(left, keyOf);
  const rightCounts = countBy(right, keyOf);
  return {
    officialOnly: countDifferences(leftCounts, rightCounts, valueOf),
    rjestOnly: countDifferences(rightCounts, leftCounts, valueOf),
  };
}

function countDifferences(primary, comparison, valueOf) {
  return [...primary]
    .map(([key, count]) => ({
      ...valueOf(key),
      count: Math.max(0, count - (comparison.get(key) ?? 0)),
    }))
    .filter(value => value.count > 0)
    .sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    );
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
