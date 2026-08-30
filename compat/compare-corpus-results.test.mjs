import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

const comparator = resolve('compat/compare-corpus-results.mjs');

test('requires explicit policy for randomized skipped test names', () => {
  const fixture = comparisonFixture();
  try {
    const strict = compare(fixture);
    assert.equal(strict.status, 1);
    const strictReport = JSON.parse(strict.stdout);
    assert.equal(strictReport.tests.namesAndStatusesExact, false);
    assert.deepEqual(strictReport.tests.identityParity, {
      matching: 1,
      percentage: 50,
      total: 2,
    });
    assert.deepEqual(strictReport.tests.identityStatusParity, {
      matching: 1,
      percentage: 50,
      total: 2,
    });
    assert.deepEqual(strictReport.tests.identityStatusDifferences, {
      officialOnly: [
        {
          count: 1,
          file: 'test.js',
          fullName: 'random official',
          status: 'skipped',
        },
      ],
      rjestOnly: [
        {
          count: 1,
          file: 'test.js',
          fullName: 'random rjest',
          status: 'skipped',
        },
      ],
    });

    const relaxed = compare(fixture, '--compare-skipped-by-file-count');
    assert.equal(relaxed.status, 0);
    const report = JSON.parse(relaxed.stdout);
    assert.equal(report.compatible, true);
    assert.equal(report.tests.executedNamesAndStatusesExact, true);
    assert.equal(report.tests.skippedCountsByFileExact, true);
    assert.equal(report.tests.skippedNamesAndStatusesExact, false);
  } finally {
    fixture.cleanup();
  }
});

test('reports 100 percent identity and status parity for exact results', () => {
  const fixture = comparisonFixture({rjestSkippedName: 'random official'});
  try {
    const comparison = compare(fixture);
    assert.equal(comparison.status, 0);
    const report = JSON.parse(comparison.stdout);
    assert.deepEqual(report.tests.identityParity, {
      matching: 2,
      percentage: 100,
      total: 2,
    });
    assert.deepEqual(report.tests.identityStatusParity, {
      matching: 2,
      percentage: 100,
      total: 2,
    });
    assert.deepEqual(report.tests.identityStatusDifferences, {
      officialOnly: [],
      rjestOnly: [],
    });
    assert.deepEqual(report.suites.statusCounts, {
      official: {failed: 0, passed: 1, skipped: 0, todo: 0},
      rjest: {failed: 0, passed: 1, skipped: 0, todo: 0},
    });
    assert.deepEqual(report.tests.statusCounts, {
      official: {failed: 0, passed: 1, skipped: 1, todo: 0},
      rjest: {failed: 0, passed: 1, skipped: 1, todo: 0},
    });
  } finally {
    fixture.cleanup();
  }
});

test('classifies all-skipped suites independently from passing suites', () => {
  const fixture = comparisonFixture({
    officialPassedStatus: 'pending',
    rjestPassedStatus: 'skipped',
    rjestSkippedName: 'random official',
  });
  try {
    const comparison = compare(fixture);
    assert.equal(comparison.status, 0);
    const report = JSON.parse(comparison.stdout);
    assert.deepEqual(report.suites.statusCounts, {
      official: {failed: 0, passed: 0, skipped: 1, todo: 0},
      rjest: {failed: 0, passed: 0, skipped: 1, todo: 0},
    });
    assert.deepEqual(report.tests.statusCounts, {
      official: {failed: 0, passed: 0, skipped: 2, todo: 0},
      rjest: {failed: 0, passed: 0, skipped: 2, todo: 0},
    });
  } finally {
    fixture.cleanup();
  }
});

test('distinguishes identity coverage from identity and status parity', () => {
  const fixture = comparisonFixture({
    rjestPassedStatus: 'failed',
    rjestSkippedName: 'random official',
  });
  try {
    const comparison = compare(fixture);
    assert.equal(comparison.status, 1);
    const report = JSON.parse(comparison.stdout);
    assert.deepEqual(report.tests.identityParity, {
      matching: 2,
      percentage: 100,
      total: 2,
    });
    assert.deepEqual(report.tests.identityStatusParity, {
      matching: 1,
      percentage: 50,
      total: 2,
    });
    assert.deepEqual(report.tests.identityStatusDifferences, {
      officialOnly: [
        {
          count: 1,
          file: 'test.js',
          fullName: 'runs',
          status: 'passed',
        },
      ],
      rjestOnly: [
        {
          count: 1,
          file: 'test.js',
          fullName: 'runs',
          status: 'failed',
        },
      ],
    });
  } finally {
    fixture.cleanup();
  }
});

test('reports duplicate identity and status multiplicities', () => {
  const fixture = comparisonFixture({
    duplicateRjestPassed: true,
    rjestSkippedName: 'random official',
  });
  try {
    const comparison = compare(fixture);
    assert.equal(comparison.status, 1);
    const report = JSON.parse(comparison.stdout);
    assert.deepEqual(report.tests.identityStatusParity, {
      matching: 2,
      percentage: 66.667,
      total: 3,
    });
    assert.deepEqual(report.tests.identityStatusDifferences, {
      officialOnly: [],
      rjestOnly: [
        {
          count: 1,
          file: 'test.js',
          fullName: 'runs',
          status: 'passed',
        },
      ],
    });
  } finally {
    fixture.cleanup();
  }
});

test('never relaxes executed identities or skipped counts', () => {
  const changedExecuted = comparisonFixture({rjestPassedName: 'different'});
  const changedSkippedCount = comparisonFixture({extraRjestSkipped: true});
  try {
    assert.equal(
      compare(changedExecuted, '--compare-skipped-by-file-count').status,
      1,
    );
    assert.equal(
      compare(changedSkippedCount, '--compare-skipped-by-file-count').status,
      1,
    );
  } finally {
    changedExecuted.cleanup();
    changedSkippedCount.cleanup();
  }
});

function comparisonFixture(options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'rjest-corpus-comparator-'));
  const officialPath = join(directory, 'official.json');
  const rjestPath = join(directory, 'rjest.json');
  const testPath = join(directory, 'project', 'test.js');
  const official = {
    coverageMap: {},
    snapshot: {},
    testResults: [
      {
        assertionResults: [
          {
            fullName: 'runs',
            status: options.officialPassedStatus ?? 'passed',
          },
          {fullName: 'random official', status: 'pending'},
        ],
        name: testPath,
      },
    ],
  };
  const tests = [
    {
      fullName: options.rjestPassedName ?? 'runs',
      status: options.rjestPassedStatus ?? 'passed',
    },
    {
      fullName: options.rjestSkippedName ?? 'random rjest',
      status: 'skipped',
    },
  ];
  if (options.extraRjestSkipped) {
    tests.push({fullName: 'another random rjest', status: 'skipped'});
  }
  if (options.duplicateRjestPassed) {
    tests.push({fullName: 'runs', status: 'passed'});
  }
  const rjest = {
    coverageMap: {},
    testResults: [
      {
        errors: [],
        snapshot: {},
        testPath,
        tests,
      },
    ],
  };
  writeFileSync(officialPath, JSON.stringify(official));
  writeFileSync(rjestPath, JSON.stringify(rjest));
  return {
    cleanup: () => rmSync(directory, {recursive: true}),
    officialPath,
    rjestPath,
    root: join(directory, 'project'),
  };
}

function compare(fixture, ...options) {
  return spawnSync(
    process.execPath,
    [
      comparator,
      '--root',
      fixture.root,
      ...options,
      fixture.officialPath,
      fixture.rjestPath,
    ],
    {encoding: 'utf8'},
  );
}
