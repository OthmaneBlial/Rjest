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
    assert.equal(JSON.parse(strict.stdout).tests.namesAndStatusesExact, false);

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
          {fullName: 'runs', status: 'passed'},
          {fullName: 'random official', status: 'pending'},
        ],
        name: testPath,
      },
    ],
  };
  const tests = [
    {
      fullName: options.rjestPassedName ?? 'runs',
      status: 'passed',
    },
    {fullName: 'random rjest', status: 'skipped'},
  ];
  if (options.extraRjestSkipped) {
    tests.push({fullName: 'another random rjest', status: 'skipped'});
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
