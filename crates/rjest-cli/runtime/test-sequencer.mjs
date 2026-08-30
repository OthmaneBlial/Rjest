import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, rmSync, statSync} from 'node:fs';
import {createRequire} from 'node:module';
import {delimiter, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createInterface} from 'node:readline';

const PREFIX = '__RJEST_SEQUENCER__';

await main();

async function main() {
  const lines = createInterface({input: process.stdin, crlfDelay: Infinity});
  const iterator = lines[Symbol.asyncIterator]();
  const initial = await iterator.next();
  if (initial.done) return;

  let state;
  try {
    state = await startSession(JSON.parse(initial.value));
    respond({ok: true, order: state.order});
  } catch (error) {
    respond({ok: false, error: formatError(error)});
    return;
  }

  const final = await iterator.next();
  if (final.done) return;
  try {
    const request = JSON.parse(final.value);
    if (request.action === 'cacheResults') {
      if (typeof state.sequencer.cacheResults !== 'function') {
        throw new TypeError('sequencer.cacheResults is not a function');
      }
      state.sequencer.cacheResults(
        state.orderedTests,
        toJestAggregatedResult(request.result),
      );
    } else if (request.action !== 'close') {
      throw new TypeError(`unknown sequencer action ${String(request.action)}`);
    }
    respond({ok: true});
  } catch (error) {
    respond({ok: false, error: formatError(error)});
  }
}

async function startSession(request) {
  const modulePath = await resolveSequencer(
    request.testSequencer,
    request.rootDir,
    request.resolver,
  );
  const loaded = await loadModule(modulePath, request.rootDir);
  let Sequencer = loaded?.default ?? loaded;
  if (typeof Sequencer !== 'function' && typeof Sequencer?.default === 'function') {
    Sequencer = Sequencer.default;
  }
  if (typeof Sequencer !== 'function') {
    throw new TypeError(`Test sequencer ${modulePath} must export a class`);
  }

  const contextById = new Map();
  const contexts = request.contexts.map(context => {
    const testPaths = request.tests
      .filter(test => test.contextId === context.id)
      .map(test => test.path);
    mkdirSync(context.cacheDirectory, {recursive: true});
    const normalized = {
      config: {
        cache: context.cache,
        cacheDirectory: context.cacheDirectory,
        displayName: context.displayName ?? undefined,
        haste: {hasteMapModulePath: null},
        id: createHash('sha1')
          .update(`${context.rootDir}\0${context.id}`)
          .digest('hex'),
        rootDir: context.rootDir,
      },
      hasteFS: makeHasteFS(testPaths),
      moduleMap: {},
      resolver: {},
    };
    contextById.set(context.id, normalized);
    return normalized;
  });

  const identity = new WeakMap();
  const tests = request.tests.map(test => {
    const value = {
      context: contextById.get(test.contextId),
      path: test.path,
    };
    identity.set(value, test.id);
    return value;
  });
  const globalConfig = {
    bail: request.bail,
    onlyFailures: request.onlyFailures,
    randomize: request.randomize,
    rootDir: request.rootDir,
    seed: request.seed,
    shard: request.shard ?? undefined,
    testSequencer: modulePath,
  };
  const sequencer = new Sequencer({contexts, globalConfig});
  if (typeof sequencer._getCachePath === 'function') {
    for (const context of contexts) {
      if (!context.config.cache) {
        rmSync(sequencer._getCachePath(context), {force: true});
      }
    }
  }
  let orderedTests = tests;
  if (request.shard) {
    if (typeof sequencer.shard !== 'function') {
      throw new TypeError(
        `Shard ${request.shard.shardIndex}/${request.shard.shardCount} requested, ` +
          `but test sequencer ${Sequencer.name} in ${modulePath} has no shard method.`,
      );
    }
    orderedTests = await sequencer.shard(orderedTests, request.shard);
    assertTestArray(orderedTests, 'shard');
  }
  if (typeof sequencer.sort !== 'function') {
    throw new TypeError(`Test sequencer ${Sequencer.name} in ${modulePath} has no sort method.`);
  }
  orderedTests = await sequencer.sort(orderedTests);
  assertTestArray(orderedTests, 'sort');
  if (request.onlyFailures) {
    if (typeof sequencer.allFailedTests !== 'function') {
      throw new TypeError(
        `Test sequencer ${Sequencer.name} in ${modulePath} has no allFailedTests method.`,
      );
    }
    orderedTests = await sequencer.allFailedTests(orderedTests);
    assertTestArray(orderedTests, 'allFailedTests');
  }
  const order = orderedTests.map(test => {
    const id = identity.get(test);
    if (id === undefined) {
      throw new TypeError('Custom test sequencer returned a test object it did not receive');
    }
    return id;
  });
  return {order, orderedTests, sequencer};
}

async function resolveSequencer(specifier, rootDir, resolverSpecifier) {
  const rootRequire = createRequire(resolve(rootDir, 'package.json'));
  const customResolver = resolverSpecifier
    ? await loadCustomResolver(resolverSpecifier, rootDir)
    : undefined;
  const defaultResolver = (request, options) => {
    const basedirRequire = createRequire(resolve(options.basedir, 'package.json'));
    return basedirRequire.resolve(String(request));
  };
  const defaultAsyncResolver = async (request, options) => defaultResolver(request, options);
  const resolverOptions = {
    basedir: rootDir,
    conditions: undefined,
    defaultAsyncResolver,
    defaultResolver,
    extensions: undefined,
    moduleDirectory: undefined,
    paths: process.env.NODE_PATH
      ? process.env.NODE_PATH.split(delimiter).filter(Boolean)
      : undefined,
    rootDir: undefined,
  };
  const candidates = [`jest-sequencer-${specifier}`, specifier];
  let cause;
  for (const candidate of candidates) {
    if (customResolver) {
      try {
        const resolved = customResolver(candidate, resolverOptions);
        if (resolved && typeof resolved.then === 'function') {
          throw new TypeError(
            `Custom resolver returned a promise while resolving ${candidate} synchronously`,
          );
        }
        if (resolved) return resolved;
      } catch (error) {
        cause = error;
      }
    }
    try {
      return rootRequire.resolve(candidate);
    } catch (error) {
      cause = error;
    }
  }
  throw new Error(`Test sequencer ${specifier} cannot be found from ${rootDir}`, {cause});
}

async function loadCustomResolver(specifier, rootDir) {
  const rootRequire = createRequire(resolve(rootDir, 'package.json'));
  const modulePath = rootRequire.resolve(specifier);
  const loaded = await loadModule(modulePath, rootDir);
  const exported = loaded?.default ?? loaded;
  if (typeof exported === 'function') return exported;
  const sync =
    typeof exported?.sync === 'function'
      ? exported.sync
      : typeof loaded?.sync === 'function'
      ? loaded.sync
      : undefined;
  if (sync) return sync;
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

function makeHasteFS(testPaths) {
  return {
    exists: path => existsSync(path),
    getAllFiles: () => [...testPaths],
    getDependencies: () => null,
    getModuleName: () => null,
    getSha1: () => null,
    getSize: path => {
      try {
        return statSync(path).size;
      } catch {
        return null;
      }
    },
  };
}

function toJestAggregatedResult(result) {
  const testResults = result.testResults.map(file => {
    const numFailingTests = file.tests.filter(test => test.status === 'failed').length;
    const numPassingTests = file.tests.filter(test => test.status === 'passed').length;
    const numPendingTests = file.tests.filter(test => test.status === 'skipped').length;
    const numTodoTests = file.tests.filter(test => test.status === 'todo').length;
    return {
      numFailingTests,
      numPassingTests,
      numPendingTests,
      numTodoTests,
      perfStats: {
        end: file.durationMs,
        runtime: file.durationMs,
        slow: false,
        start: 0,
      },
      skipped: file.tests.length > 0 && numPendingTests === file.tests.length,
      testExecError:
        file.errors.length > 0 ? {message: file.errors.join('\n')} : undefined,
      testFilePath: file.testPath,
      testResults: file.tests,
    };
  });
  return {
    numFailedTests: testResults.reduce((total, file) => total + file.numFailingTests, 0),
    numPassedTests: testResults.reduce((total, file) => total + file.numPassingTests, 0),
    numPendingTests: testResults.reduce((total, file) => total + file.numPendingTests, 0),
    numTodoTests: testResults.reduce((total, file) => total + file.numTodoTests, 0),
    testResults,
  };
}

function assertTestArray(value, hook) {
  if (!Array.isArray(value)) {
    throw new TypeError(`Custom test sequencer ${hook}() must return an array of tests`);
  }
}

function formatError(error) {
  return error instanceof Error ? error.stack || error.message : String(error);
}

function respond(payload) {
  process.stdout.write(`${PREFIX}${JSON.stringify(payload)}\n`);
}
