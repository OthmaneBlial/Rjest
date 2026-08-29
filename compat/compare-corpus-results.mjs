import {readFileSync} from 'node:fs';
import {relative, resolve} from 'node:path';

const {officialPath, rjestPath, root} = parseArguments(process.argv.slice(2));
const official = JSON.parse(readFileSync(officialPath, 'utf8'));
const rjest = JSON.parse(readFileSync(rjestPath, 'utf8'));

const officialResult = normalizeOfficial(official);
const rjestResult = normalizeRjest(rjest);
const suitePathsExact = same(officialResult.suites, rjestResult.suites);
const testsExact = same(officialResult.tests, rjestResult.tests);
const snapshotsExact = same(officialResult.snapshots, rjestResult.snapshots);
const coverage = compareCoverage(official.coverageMap ?? {}, rjest.coverageMap ?? {});

const compatible =
  suitePathsExact &&
  testsExact &&
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
  },
  tests: {
    official: officialResult.tests.length,
    rjest: rjestResult.tests.length,
    namesAndStatusesExact: testsExact,
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
  const paths = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--root') {
      comparisonRoot = resolve(args[index + 1]);
      index += 1;
    } else {
      paths.push(args[index]);
    }
  }
  if (paths.length !== 2) {
    console.error(
      'Usage: node compat/compare-corpus-results.mjs [--root <project>] <jest.json> <rjest.json>',
    );
    process.exit(2);
  }
  return {
    officialPath: resolve(paths[0]),
    rjestPath: resolve(paths[1]),
    root: comparisonRoot,
  };
}

function normalizeOfficial(result) {
  const suites = result.testResults.map(file => normalizePath(file.name)).sort();
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

function compareTests(left, right) {
  return `${left.file}\0${left.fullName}\0${left.status}`.localeCompare(
    `${right.file}\0${right.fullName}\0${right.status}`,
  );
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
