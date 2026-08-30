import {createRequire} from 'node:module';
import {delimiter, isAbsolute, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createInterface} from 'node:readline';

const PREFIX = '__RJEST_RESULTS_PROCESSOR__';

await main();

async function main() {
  const lines = createInterface({input: process.stdin, crlfDelay: Infinity});
  const iterator = lines[Symbol.asyncIterator]();
  const initial = await iterator.next();
  if (initial.done) return;

  try {
    const request = JSON.parse(initial.value);
    const modulePath = await resolveProcessor(
      request.modulePath,
      request.projectConfig,
    );
    const loaded = await loadModule(modulePath, request.rootDir);
    let processor = loaded?.default ?? loaded;
    if (typeof processor !== 'function' && typeof processor?.default === 'function') {
      processor = processor.default;
    }
    if (typeof processor !== 'function') {
      throw new TypeError(
        `Test Results Processor ${modulePath} must export a function.`,
      );
    }

    const aggregated = toJestAggregatedResult(
      request.result,
      request.coverage,
      request.success,
    );
    const processed = await processor(aggregated);
    const formatted = formatTestResults(processed);
    respond({ok: true, result: formatted, success: Boolean(formatted.success)});
  } catch (error) {
    respond({ok: false, error: formatError(error)});
  }
}

async function resolveProcessor(specifier, config) {
  if (isAbsolute(specifier)) return specifier;
  const rootDir = config.rootDir;
  const rootRequire = createRequire(resolve(rootDir, 'package.json'));
  const customResolver = config.resolver
    ? await loadCustomResolver(config.resolver, rootDir)
    : undefined;
  const defaultResolver = (request, options = {}) => {
    const basedir = options.basedir ?? rootDir;
    return createRequire(resolve(basedir, 'package.json')).resolve(request);
  };
  const resolverOptions = {
    basedir: rootDir,
    conditions: undefined,
    defaultAsyncResolver: async (request, options) =>
      defaultResolver(request, options),
    defaultResolver,
    extensions: (config.moduleFileExtensions ?? []).map(extension => `.${extension}`),
    moduleDirectory: config.moduleDirectories,
    paths: config.modulePaths?.length
      ? config.modulePaths
      : process.env.NODE_PATH?.split(delimiter).filter(Boolean),
    rootDir,
  };
  if (customResolver) {
    const resolved = customResolver(specifier, resolverOptions);
    if (resolved && typeof resolved.then === 'function') {
      throw new TypeError(
        `Custom resolver returned a promise while resolving ${specifier} synchronously`,
      );
    }
    if (resolved) return resolved;
  }
  return rootRequire.resolve(specifier);
}

async function loadCustomResolver(specifier, rootDir) {
  const rootRequire = createRequire(resolve(rootDir, 'package.json'));
  const modulePath = rootRequire.resolve(specifier);
  const loaded = await loadModule(modulePath, rootDir);
  const exported = loaded?.default ?? loaded;
  if (typeof exported === 'function') return exported;
  if (typeof exported?.sync === 'function') return exported.sync;
  if (typeof loaded?.sync === 'function') return loaded.sync;
  if (typeof exported?.async === 'function' || typeof loaded?.async === 'function') {
    return undefined;
  }
  throw new TypeError(
    `Resolver located at ${modulePath} does not export a function or an object with "sync" and "async" props`,
  );
}

async function loadModule(modulePath, rootDir) {
  const rootRequire = createRequire(resolve(rootDir, 'package.json'));
  try {
    return rootRequire(modulePath);
  } catch (error) {
    if (error?.code !== 'ERR_REQUIRE_ESM' && error?.code !== 'ERR_REQUIRE_ASYNC_MODULE') {
      throw error;
    }
    return import(pathToFileURL(modulePath).href);
  }
}

function toJestAggregatedResult(result, coverage, success) {
  const aggregated = makeEmptyAggregatedResult(result.testResults.length);
  aggregated.startTime = Date.now() - result.durationMs;
  for (const [index, file] of result.testResults.entries()) {
    addResult(aggregated, toJestTestResult(file, coverage?.[index] ?? {}));
  }
  aggregated.success = Boolean(success);
  return aggregated;
}

function makeEmptyAggregatedResult(totalSuites) {
  return {
    numFailedTestSuites: 0,
    numFailedTests: 0,
    numPassedTestSuites: 0,
    numPassedTests: 0,
    numPendingTestSuites: 0,
    numPendingTests: 0,
    numRuntimeErrorTestSuites: 0,
    numTodoTests: 0,
    numTotalTestSuites: totalSuites,
    numTotalTests: 0,
    openHandles: [],
    snapshot: {
      added: 0,
      didUpdate: false,
      failure: false,
      filesAdded: 0,
      filesRemoved: 0,
      filesRemovedList: [],
      filesUnmatched: 0,
      filesUpdated: 0,
      matched: 0,
      total: 0,
      unchecked: 0,
      uncheckedKeysByFile: [],
      unmatched: 0,
      updated: 0,
    },
    startTime: Date.now(),
    success: false,
    testResults: [],
    wasInterrupted: false,
  };
}

function addResult(aggregated, result) {
  aggregated.testResults.push(result);
  aggregated.numTotalTests +=
    result.numPassingTests +
    result.numFailingTests +
    result.numPendingTests +
    result.numTodoTests;
  aggregated.numFailedTests += result.numFailingTests;
  aggregated.numPassedTests += result.numPassingTests;
  aggregated.numPendingTests += result.numPendingTests;
  aggregated.numTodoTests += result.numTodoTests;
  if (result.testExecError) aggregated.numRuntimeErrorTestSuites += 1;
  if (result.skipped) aggregated.numPendingTestSuites += 1;
  else if (result.numFailingTests > 0 || result.testExecError) {
    aggregated.numFailedTestSuites += 1;
  } else aggregated.numPassedTestSuites += 1;

  if (result.snapshot.added) aggregated.snapshot.filesAdded += 1;
  if (result.snapshot.fileDeleted) aggregated.snapshot.filesRemoved += 1;
  if (result.snapshot.unmatched) aggregated.snapshot.filesUnmatched += 1;
  if (result.snapshot.updated) aggregated.snapshot.filesUpdated += 1;
  aggregated.snapshot.added += result.snapshot.added;
  aggregated.snapshot.matched += result.snapshot.matched;
  aggregated.snapshot.unmatched += result.snapshot.unmatched;
  aggregated.snapshot.updated += result.snapshot.updated;
  aggregated.snapshot.unchecked += result.snapshot.unchecked;
  aggregated.snapshot.total +=
    result.snapshot.added +
    result.snapshot.matched +
    result.snapshot.unmatched +
    result.snapshot.updated;
  if (result.snapshot.uncheckedKeys.length > 0) {
    aggregated.snapshot.uncheckedKeysByFile.push({
      filePath: result.testFilePath,
      keys: result.snapshot.uncheckedKeys,
    });
  }
  aggregated.snapshot.failure ||= result.snapshot.unmatched > 0;
}

function toJestTestResult(file, coverage) {
  const testResults = file.tests.map(toJestAssertionResult);
  const numFailingTests = testResults.filter(test => test.status === 'failed').length;
  const numPassingTests = testResults.filter(test => test.status === 'passed').length;
  const numPendingTests = testResults.filter(test => test.status === 'pending').length;
  const numTodoTests = testResults.filter(test => test.status === 'todo').length;
  const end = Date.now();
  const start = end - file.durationMs;
  const errors = [...(file.errors ?? [])];
  const failureMessages = testResults.flatMap(test => test.failureMessages);
  return {
    console: (file.console ?? []).map(entry => ({
      message: entry.message,
      origin: '',
      type: entry.level,
    })),
    coverage,
    displayName: file.projectDisplayName
      ? {color: 'white', name: file.projectDisplayName}
      : undefined,
    failureMessage: [...errors, ...failureMessages].join('\n\n') || null,
    leaks: false,
    memoryUsage: file.heapUsedBytes ?? undefined,
    numFailingTests,
    numPassingTests,
    numPendingTests,
    numTodoTests,
    openHandles: [],
    perfStats: {
      end,
      loadTestEnvironmentEnd: start,
      loadTestEnvironmentStart: start,
      runtime: file.durationMs,
      setupAfterEnvEnd: start,
      setupAfterEnvStart: start,
      setupFilesEnd: start,
      setupFilesStart: start,
      slow: false,
      start,
    },
    skipped: false,
    snapshot: {
      added: file.snapshot.added,
      fileDeleted: file.snapshot.removed > 0,
      matched: file.snapshot.matched,
      unchecked: file.snapshot.uncheckedKeys.length,
      uncheckedKeys: file.snapshot.uncheckedKeys,
      unmatched: file.snapshot.unmatched,
      updated: file.snapshot.updated,
    },
    testExecError: errors.length > 0 ? serializableError(errors.join('\n\n')) : undefined,
    testFilePath: file.testPath,
    testResults,
  };
}

function toJestAssertionResult(test) {
  const status = test.status === 'skipped' ? 'pending' : test.status;
  const ancestorTitles = test.ancestorTitles ?? inferAncestorTitles(test.fullName, test.name);
  const failureMessages = test.failureMessage ? [test.failureMessage] : [];
  return {
    ancestorTitles,
    duration: test.durationMs,
    failing: false,
    failureDetails: failureMessages.map(message => new Error(message)),
    failureMessages,
    fullName: test.fullName,
    invocations: test.invocations,
    location: null,
    numPassingAsserts: test.numPassingAsserts ?? 0,
    retryReasons: test.retryReasons ?? [],
    startAt: Date.now() - test.durationMs,
    status,
    title: test.name,
  };
}

function inferAncestorTitles(fullName, title) {
  if (fullName === title) return [];
  const suffix = ` ${title}`;
  return fullName.endsWith(suffix) ? [fullName.slice(0, -suffix.length)] : [];
}

function serializableError(message) {
  return {message, stack: message, type: 'Error'};
}

function formatTestResults(results) {
  const testResults = results.testResults.map(formatTestResult);
  return {...results, testResults};
}

function formatTestResult(testResult) {
  if (testResult.testExecError) {
    const now = Date.now();
    return {
      assertionResults: testResult.testResults,
      coverage: {},
      endTime: now,
      message: testResult.failureMessage ?? testResult.testExecError.message,
      name: testResult.testFilePath,
      startTime: now,
      status: 'failed',
      summary: '',
    };
  }
  if (testResult.skipped) {
    const now = Date.now();
    return {
      assertionResults: testResult.testResults,
      coverage: {},
      endTime: now,
      message: testResult.failureMessage ?? '',
      name: testResult.testFilePath,
      startTime: now,
      status: 'skipped',
      summary: '',
    };
  }
  const allTestsExecuted = testResult.numPendingTests === 0;
  const allTestsPassed = testResult.numFailingTests === 0;
  return {
    assertionResults: testResult.testResults,
    coverage: testResult.coverage,
    endTime: testResult.perfStats.end,
    message: testResult.failureMessage ?? '',
    name: testResult.testFilePath,
    startTime: testResult.perfStats.start,
    status: allTestsPassed
      ? allTestsExecuted
        ? 'passed'
        : 'focused'
      : 'failed',
    summary: '',
  };
}

function respond(value) {
  process.stdout.write(`${PREFIX}${JSON.stringify(value)}\n`);
}

function formatError(error) {
  return error instanceof Error ? error.stack || error.message : String(error);
}
