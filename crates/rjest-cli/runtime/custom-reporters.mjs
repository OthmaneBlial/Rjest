import {createRequire} from 'node:module';
import {isAbsolute, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createInterface} from 'node:readline';

const PREFIX = '__RJEST_REPORTER__';
const BUILTIN_REPORTERS = new Set([
  'agent',
  'default',
  'github-actions',
  'summary',
]);

await main();

async function main() {
  const lines = createInterface({input: process.stdin, crlfDelay: Infinity});
  const iterator = lines[Symbol.asyncIterator]();
  const initial = await iterator.next();
  if (initial.done) return;

  let state;
  try {
    state = await startSession(JSON.parse(initial.value));
    respond({ok: true});
  } catch (error) {
    respond({ok: false, error: formatError(error)});
    return;
  }

  for await (const line of iterator) {
    try {
      const request = JSON.parse(line);
      if (request.action === 'testFileStart') {
        await onTestFileStart(state, request);
        respond({ok: true});
      } else if (request.action === 'testCaseStart') {
        await onTestCaseStart(state, request);
        respond({ok: true});
      } else if (request.action === 'testCaseResult') {
        await onTestCaseResult(state, request);
        respond({ok: true});
      } else if (request.action === 'testFileResult') {
        await onTestFileResult(state, request);
        respond({ok: true});
      } else if (request.action === 'runComplete') {
        const errors = await onRunComplete(state, request);
        respond({ok: true, errors});
        return;
      } else if (request.action === 'close') {
        respond({ok: true, errors: []});
        return;
      } else {
        throw new TypeError(`unknown custom reporter action ${String(request.action)}`);
      }
    } catch (error) {
      respond({ok: false, error: formatError(error)});
      return;
    }
  }
}

async function startSession(request) {
  const reporterContext = {
    firstRun: true,
    previousSuccess: true,
  };
  const contexts = new Map(
    request.contexts.map(context => [context.id, makeTestContext(context.config)]),
  );
  const tests = new Map(
    request.tests.map(test => [
      test.path,
      {
        context: contexts.get(test.contextId),
        path: test.path,
      },
    ]),
  );
  const reporters = [];
  for (const [specifier, options] of request.reporters) {
    if (BUILTIN_REPORTERS.has(specifier)) continue;
    const modulePath = await resolveReporter(
      specifier,
      request.rootDir,
      request.resolver,
    );
    const loaded = await loadModule(modulePath, request.rootDir);
    let Reporter = loaded?.default ?? loaded;
    if (typeof Reporter !== 'function' && typeof Reporter?.default === 'function') {
      Reporter = Reporter.default;
    }
    if (typeof Reporter !== 'function') {
      throw new TypeError(`Reporter ${modulePath} must export a class`);
    }
    try {
      reporters.push(new Reporter(request.globalConfig, options, reporterContext));
    } catch (error) {
      throw reporterError(modulePath, error);
    }
  }

  const aggregated = makeEmptyAggregatedResult(request.tests.length);
  for (const reporter of reporters) {
    if (typeof reporter.onRunStart === 'function') {
      await reporter.onRunStart(aggregated, {
        estimatedTime: request.estimatedTime ?? 0,
        showStatus: false,
      });
    }
  }
  return {aggregated, contexts, reporters, tests};
}

async function onTestFileStart(state, request) {
  const test = getTest(state, request.path, request.contextId);
  for (const reporter of state.reporters) {
    if (typeof reporter.onTestFileStart === 'function') {
      await reporter.onTestFileStart(test);
    } else if (typeof reporter.onTestStart === 'function') {
      await reporter.onTestStart(test);
    }
  }
}

async function onTestCaseStart(state, request) {
  const test = getTest(state, request.path, request.contextId);
  for (const reporter of state.reporters) {
    if (typeof reporter.onTestCaseStart === 'function') {
      await reporter.onTestCaseStart(test, request.info);
    }
  }
}

async function onTestCaseResult(state, request) {
  const test = getTest(state, request.path, request.contextId);
  const result = toJestAssertionResult(request.result);
  for (const reporter of state.reporters) {
    if (typeof reporter.onTestCaseResult === 'function') {
      await reporter.onTestCaseResult(test, result);
    }
  }
}

async function onTestFileResult(state, request) {
  const test = getTest(state, request.result.testPath, request.contextId);
  const testResult = toJestTestResult(
    request.result,
    test.context?.config?.displayName,
  );
  addResult(state.aggregated, testResult);
  for (const reporter of state.reporters) {
    if (typeof reporter.onTestFileResult === 'function') {
      await reporter.onTestFileResult(test, testResult, state.aggregated);
    } else if (typeof reporter.onTestResult === 'function') {
      await reporter.onTestResult(test, testResult, state.aggregated);
    }
  }
}

async function onRunComplete(state, request) {
  state.aggregated.wasInterrupted = false;
  state.aggregated.runExecError = undefined;
  const testContexts = new Set(state.contexts.values());
  for (const reporter of state.reporters) {
    if (typeof reporter.onRunComplete === 'function') {
      await reporter.onRunComplete(testContexts, state.aggregated);
    }
  }
  const errors = [];
  for (const reporter of state.reporters) {
    if (typeof reporter.getLastError !== 'function') continue;
    const error = reporter.getLastError();
    if (error) errors.push(formatError(error));
  }
  state.aggregated.success = Boolean(request.success) && errors.length === 0;
  return errors;
}

function getTest(state, path, contextId) {
  const existing = state.tests.get(path);
  if (existing) return existing;
  const test = {context: state.contexts.get(contextId), path};
  state.tests.set(path, test);
  return test;
}

function makeTestContext(config) {
  const emptyArray = () => [];
  const emptyNull = () => null;
  return {
    config,
    hasteFS: {
      exists: () => false,
      getAllFiles: emptyArray,
      getDependencies: emptyNull,
      getModuleName: emptyNull,
      getSha1: emptyNull,
      getSize: emptyNull,
    },
    moduleMap: {
      getModule: emptyNull,
      getMockModule: emptyNull,
      getPackage: emptyNull,
      getRawModuleMap: () => ({duplicates: new Map(), map: new Map(), mocks: new Map(), rootDir: config.rootDir}),
      toJSON: () => ({duplicates: [], map: [], mocks: [], rootDir: config.rootDir}),
    },
    resolver: {
      getModule: emptyNull,
      getModuleID: () => '',
      getModulePath: from => from,
      getPackage: emptyNull,
      isCoreModule: () => false,
      resolveModule: (from, moduleName) => resolve(from, moduleName),
    },
  };
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
}

function toJestTestResult(file, contextDisplayName) {
  const testResults = file.tests.map(toJestAssertionResult);
  const numFailingTests = testResults.filter(test => test.status === 'failed').length;
  const numPassingTests = testResults.filter(test => test.status === 'passed').length;
  const numPendingTests = testResults.filter(test => test.status === 'pending').length;
  const numTodoTests = testResults.filter(test => test.status === 'todo').length;
  const end = Date.now();
  const start = end - file.durationMs;
  const errors = [...file.errors];
  const failureMessages = testResults.flatMap(test => test.failureMessages);
  return {
    console: file.console.map(entry => ({
      message: entry.message,
      origin: '',
      type: entry.level,
    })),
    displayName: contextDisplayName ?? (file.projectDisplayName
      ? {color: 'white', name: file.projectDisplayName}
      : undefined),
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
      fileDeleted: false,
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
    startedAt: test.startedAt,
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

async function resolveReporter(specifier, rootDir, resolverSpecifier) {
  if (isAbsolute(specifier)) return specifier;
  const rootRequire = createRequire(resolve(rootDir, 'package.json'));
  if (resolverSpecifier) {
    const customResolver = await loadCustomResolver(resolverSpecifier, rootDir);
    if (customResolver) {
      const defaultResolver = (request, options = {}) => {
        const basedir = options.basedir ?? rootDir;
        return createRequire(resolve(basedir, 'package.json')).resolve(request);
      };
      const resolved = customResolver(specifier, {
        basedir: rootDir,
        conditions: undefined,
        defaultAsyncResolver: async (request, options) => defaultResolver(request, options),
        defaultResolver,
        extensions: undefined,
        moduleDirectory: undefined,
        paths: undefined,
        rootDir: undefined,
      });
      if (resolved && typeof resolved.then === 'function') {
        throw new TypeError(
          `Custom resolver returned a promise while resolving ${specifier} synchronously`,
        );
      }
      if (resolved) return resolved;
    }
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

function reporterError(modulePath, error) {
  const wrapped = new Error(
    `An error occurred while adding the reporter at path "${modulePath}".\n${formatError(error)}`,
  );
  wrapped.cause = error;
  return wrapped;
}

function respond(value) {
  process.stdout.write(`${PREFIX}${JSON.stringify(value)}\n`);
}

function formatError(error) {
  if (error instanceof Error) return error.stack || error.message;
  return String(error);
}
