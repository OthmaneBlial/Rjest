import {writeFileSync} from 'node:fs';
import {basename, join} from 'node:path';

export default class LifecycleReporter {
  constructor(globalConfig, options, context) {
    this.rootDir = globalConfig.rootDir;
    this.events = [
      {
        event: 'constructor',
        firstRun: context.firstRun,
        json: globalConfig.json,
        label: options.label,
        maxWorkers: globalConfig.maxWorkers,
        previousSuccess: context.previousSuccess,
        rootDirIsAbsolute: this.rootDir.startsWith('/'),
        runInBand: globalConfig.runInBand,
        silent: globalConfig.silent,
        verbose: globalConfig.verbose,
      },
    ];
  }

  async onRunStart(results, options) {
    await Promise.resolve();
    this.events.push({
      estimatedTime: options.estimatedTime,
      event: 'run-start',
      numTotalTestSuites: results.numTotalTestSuites,
      numTotalTests: results.numTotalTests,
      showStatus: options.showStatus,
      success: results.success,
    });
  }

  async onTestFileStart(test) {
    await Promise.resolve();
    this.events.push({
      contextRootMatches: test.context.config.rootDir === this.rootDir,
      event: 'file-start',
      path: basename(test.path),
    });
  }

  onTestCaseStart(test, info) {
    this.events.push({
      ancestorTitles: info.ancestorTitles,
      event: 'case-start',
      mode: info.mode ?? null,
      path: basename(test.path),
      startedAtIsNumber: typeof info.startedAt === 'number',
      title: info.title,
    });
  }

  onTestCaseResult(test, result) {
    this.events.push({
      ancestorTitles: result.ancestorTitles,
      durationIsNumber: typeof result.duration === 'number',
      event: 'case-result',
      numPassingAsserts: result.numPassingAsserts,
      path: basename(test.path),
      startedAtIsRecent:
        typeof result.startedAt === 'number' &&
        Date.now() - result.startedAt >= 0 &&
        Date.now() - result.startedAt < 60_000,
      status: result.status,
      title: result.title,
    });
  }

  async onTestResult(test, result, aggregated) {
    await Promise.resolve();
    this.events.push({
      event: 'file-result-legacy',
      numFailedTests: aggregated.numFailedTests,
      numPassedTests: aggregated.numPassedTests,
      numPassingTests: result.numPassingTests,
      path: basename(test.path),
      testStatuses: result.testResults.map(testCase => testCase.status),
    });
  }

  async onRunComplete(contexts, results) {
    await Promise.resolve();
    this.events.push({
      contexts: contexts.size,
      event: 'run-complete',
      numFailedTests: results.numFailedTests,
      numPassedTests: results.numPassedTests,
      numTotalTests: results.numTotalTests,
      snapshotTotal: results.snapshot.total,
      successDuringHook: results.success,
    });
    writeFileSync(
      join(this.rootDir, 'reporter-events.json'),
      `${JSON.stringify(this.events, null, 2)}\n`,
    );
  }
}
