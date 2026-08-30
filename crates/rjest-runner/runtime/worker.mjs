import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import Module, {createRequire, registerHooks} from 'node:module';
import {isDeepStrictEqual, format, inspect, promisify} from 'node:util';
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  resolve as resolvePath,
} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';

const PROTOCOL_VERSION = 19;
const RESULT_PREFIX = '__RJEST_RESULT__';
const ASYMMETRIC = Symbol.for('rjest.asymmetricMatcher');
const RESULT_TEST_NODE = Symbol('rjest.testNode');
const nativeSetTimeout = globalThis.setTimeout;
const nativeClearTimeout = globalThis.clearTimeout;
const nativeSetInterval = globalThis.setInterval;
const nativeClearInterval = globalThis.clearInterval;
const nativeSetImmediate = globalThis.setImmediate;
const nativeClearImmediate = globalThis.clearImmediate;
const nativeQueueMicrotask = globalThis.queueMicrotask;
const NativeDate = globalThis.Date;
const NativeFunction = globalThis.Function;
const nativePerformance = globalThis.performance;
const nativePerformanceNowDescriptor = Object.getOwnPropertyDescriptor(
  nativePerformance,
  'now',
);
const nativeNextTick = process.nextTick;
const nativeHrtime = process.hrtime;
const request = JSON.parse(readFileSync(0, 'utf8'));
const coverageFilter = request.coverageFilter
  ? new Set(request.coverageFilter.map(normalizedRuntimePath))
  : undefined;
const requireFromTest = createRequire(request.testPath);
const configuredModuleDirectories = request.moduleDirectories ?? [
  'node_modules',
];
const usesCustomModuleDirectories = !(
  configuredModuleDirectories.length === 1 &&
  configuredModuleDirectories[0] === 'node_modules'
);
const RuntimeResolverFactory = usesCustomModuleDirectories || request.resolver
  ? requireFromTest('unrs-resolver').ResolverFactory
  : undefined;
let installedJestMajorVersion;
try {
  installedJestMajorVersion = Number.parseInt(
    requireFromTest('jest/package.json').version.split('.')[0],
    10,
  );
} catch {
  installedJestMajorVersion = undefined;
}
const originalModuleLoad = Module._load;
const originalModuleResolveFilename = Module._resolveFilename;
const moduleMocks = new Map();
const virtualModuleMocks = new Map();
const esmModuleMocks = [];
let esmModuleMockCache = new Map();
let inheritedEsmModuleMockCache;
const pendingEsmAutoMocks = new Map();
const explicitlyUnmockedEsmModules = new Set();
const esmMockValues = new Map();
const onGenerateMockCallbacks = new Set();
const dynamicImportBridges = new Map();
const esmStaticDependencyCache = new Map();
const asyncCustomResolverCache = new Map();
const bypassModuleMocks = new Set();
const explicitlyUnmockedModules = new Set();
const deeplyUnmockedModules = new Set();
const transitivelyUnmockedModules = new Set();
const originalModuleExtensions = new Map(Object.entries(Module._extensions));
const runtimeTransformers = [];
const transformCacheFs = new Map();
const transformedSourceCache = new Map();
const runtimeSourceMaps = new Map();
const pendingAsyncTransforms = new Map();
const instrumentedFiles = new Set();
const runtimeSnapshotSerializers = [];
let runtimePrettyFormatter;
let runtimePrettyFormatPlugins = [];
let runtimePrettyFormatSupportsBasicPrototype = false;
let jsdomEnvironment;
let customTestEnvironment;
let fileDocblockPragmas = Object.create(null);
let nativeWindowTimers;
let nativeAnimationFrame;
let transformerDepth = 0;
let automockEnabled = false;
let esmAutomockBypassDepth = 0;
let esmHooksInstalled = false;
let esmModuleGeneration = 0;
let esmResolutionDepth = 0;
let nextEsmModuleGeneration = 1;
let nextEsmMockId = 1;
let nextEsmMockValueId = 1;

if (request.protocolVersion !== PROTOCOL_VERSION) {
  throw new Error(`Unsupported Rjest worker protocol ${request.protocolVersion}`);
}

const started = performance.now();
const consoleEntries = [];
const fileErrors = [];
const randomGenerator = request.randomize
  ? createRandomGenerator(request.seed)
  : undefined;
const mockRegistry = new Set();
const restoreRegistry = new Set();
const replacedPropertyRegistry = new WeakMap();
const customMatchers = new Map();
let invocationOrder = 0;
let defaultTimeout = request.defaultTimeoutMs;
let configuredRetryTimes;
let configuredRetryWait;
let configuredRetryImmediately;
let configuredLogErrorsBeforeRetry;
let processErrorGeneration = 0;
let activeTest;
let activeModulePath = request.testPath;
let effectiveTestEnvironment = request.testEnvironment;
let effectiveTestEnvironmentOptions = request.testEnvironmentOptions ?? {};
const snapshotState = {
  update: request.snapshotUpdate,
  fileExists: request.snapshotFileExists,
  data: {...request.snapshotData},
  dirty: request.snapshotDirty,
  unchecked: new Set(Object.keys(request.snapshotData)),
  counts: new Map(),
  // Records remain until a retry clears them so an enclosing describe retry
  // can roll back passing as well as failing descendant tests.
  attempts: new WeakMap(),
  inlineUpdates: [],
  writeCount: 0,
  added: 0,
  matched: 0,
  unmatched: 0,
  updated: 0,
  removed: 0,
};
const expectState = {
  assertionCalls: 0,
  currentTestName: undefined,
  expectedAssertionsNumber: null,
  isExpectingAssertions: false,
  numPassingAsserts: 0,
  snapshotState,
  suppressedErrors: [],
  testPath: request.testPath,
};

for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
  console[level] = (...values) => {
    consoleEntries.push({level, message: format(...values)});
  };
}

const rootSuite = makeSuite('ROOT_DESCRIBE_BLOCK', undefined, undefined);
let currentSuite = rootSuite;
let definitionComplete = false;

function makeSuite(name, parent, mode) {
  return {
    type: 'suite',
    name,
    parent,
    mode,
    children: [],
    hooks: {beforeAll: [], afterAll: [], beforeEach: [], afterEach: []},
    retryOptions: undefined,
    shuffled: false,
  };
}

function createRandomGenerator(seed) {
  let s01 = -1;
  let s00 = ~seed;
  let s11 = seed | 0;
  let s10 = 0;
  const unsafeNext = () => {
    const output = (s00 + s10) | 0;
    const a0 = s10 ^ s00;
    const a1 = s11 ^ s01;
    const previousS00 = s00;
    const previousS01 = s01;
    s00 =
      (previousS00 << 24) ^
      (previousS01 >>> 8) ^
      a0 ^
      (a0 << 16);
    s01 =
      (previousS01 << 24) ^
      (previousS00 >>> 8) ^
      a1 ^
      ((a1 << 16) | (a0 >>> 16));
    s10 = (a1 << 5) ^ (a0 >>> 27);
    s11 = (a0 << 5) ^ (a1 >>> 27);
    return output;
  };
  return {
    next(from, to) {
      const rangeSize = to - from + 1;
      const maximum =
        rangeSize > 2
          ? Math.trunc(0x100000000 / rangeSize) * rangeSize
          : 0x100000000;
      let value = unsafeNext() + 0x80000000;
      while (value >= maximum) value = unsafeNext() + 0x80000000;
      return (value % rangeSize) + from;
    },
  };
}

function shuffleInPlace(values, random) {
  for (let index = 0; index < values.length; index += 1) {
    const target = random.next(index, values.length - 1);
    [values[index], values[target]] = [values[target], values[index]];
  }
}

function assertCanDefine(kind) {
  if (definitionComplete) {
    throw new Error(`Cannot add a ${kind} after tests have started running.`);
  }
}

function defineSuite(name, callback, mode) {
  assertCanDefine('describe block');
  if (typeof callback !== 'function') {
    throw new TypeError('describe expects a callback function');
  }
  const blockName = String(name);
  dispatchCustomEnvironmentSyncEvent({
    asyncError: new Error(),
    blockName,
    mode,
    name: 'start_describe_definition',
  });
  const suite = makeSuite(blockName, currentSuite, mode);
  currentSuite.children.push(suite);
  const previous = currentSuite;
  currentSuite = suite;
  try {
    const returned = callback();
    if (returned && typeof returned.then === 'function') {
      throw new Error(
        'Returning a Promise from describe is not supported. Tests must be defined synchronously.',
      );
    }
  } finally {
    dispatchCustomEnvironmentSyncEvent({
      blockName,
      mode,
      name: 'finish_describe_definition',
    });
    currentSuite = previous;
  }
}

function defineTest(name, callback, mode, timeout, concurrent = false) {
  assertCanDefine('test');
  if (mode !== 'todo' && typeof callback !== 'function') {
    throw new TypeError('test expects a callback function');
  }
  const node = {
    type: 'test',
    name: String(name),
    callback,
    mode,
    timeout,
    concurrent,
    parent: currentSuite,
    invocations: 0,
    retryReasons: [],
  };
  currentSuite.children.push(node);
  dispatchCustomEnvironmentSyncEvent({
    asyncError: new Error(),
    concurrent,
    failing: false,
    fn: callback,
    mode,
    name: 'add_test',
    testName: node.name,
    timeout,
  });
}

function defineHook(type, callback, timeout) {
  assertCanDefine('hook');
  if (typeof callback !== 'function') {
    throw new TypeError(`${type} expects a callback function`);
  }
  currentSuite.hooks[type].push({
    callback,
    fn: callback,
    parent: currentSuite,
    timeout,
    type,
  });
  dispatchCustomEnvironmentSyncEvent({
    asyncError: new Error(),
    fn: callback,
    hookType: type,
    name: 'add_hook',
    timeout,
  });
}

function describe(name, callback) {
  defineSuite(name, callback, undefined);
}
describe.only = (name, callback) => defineSuite(name, callback, 'only');
describe.skip = (name, callback) => defineSuite(name, callback, 'skip');
describe.each = table => (name, callback) =>
  table.forEach((row, index) => {
    const values = Array.isArray(row) ? row : [row];
    defineSuite(
      interpolateName(name, values, index),
      () => callback(...values),
      undefined,
    );
  });

function test(name, callback, timeout) {
  defineTest(name, callback, undefined, timeout);
}
test.only = (name, callback, timeout) =>
  defineTest(name, callback, 'only', timeout);
test.skip = (name, callback, timeout) =>
  defineTest(name, callback, 'skip', timeout);
test.todo = name => defineTest(name, undefined, 'todo', undefined);
test.concurrent = (name, callback, timeout) =>
  defineTest(name, callback, undefined, timeout, true);
test.concurrent.only = (name, callback, timeout) =>
  defineTest(name, callback, 'only', timeout, true);
test.concurrent.skip = (name, callback, timeout) =>
  defineTest(name, callback, 'skip', timeout, true);
test.each = table => (name, callback, timeout) =>
  table.forEach((row, index) => {
    const values = Array.isArray(row) ? row : [row];
    defineTest(
      interpolateName(name, values, index),
      () => callback(...values),
      undefined,
      timeout,
    );
  });
const it = test;

function interpolateName(name, values, index) {
  const escapedPercent = '@@__RJEST_EACH_PERCENT__@@';
  let valueIndex = 0;
  let interpolated = String(name)
    .replaceAll('%%', escapedPercent)
    .replace(/%[#\$Odfijops]/g, token => {
      if (token === '%#') return String(index);
      if (token === '%$') return String(index + 1);
      const value = values[valueIndex++];
      if (token === '%p') return formatEachValue(value);
      return format(token, value);
    })
    .replaceAll(escapedPercent, '%');
  const row = values.length === 1 ? values[0] : undefined;
  if (!row || typeof row !== 'object') return interpolated;
  interpolated = interpolated.replace(
    /\$([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*|#)/g,
    (placeholder, path) => {
      if (path === '#') return String(index);
      let value = row;
      for (const key of path.split('.')) {
        if (value === null || value === undefined || !(key in Object(value))) {
          return placeholder;
        }
        value = value[key];
      }
      return isPrimitive(value) ? String(value) : formatEachValue(value);
    },
  );
  return interpolated;
}

function isPrimitive(value) {
  return value === null || (typeof value !== 'object' && typeof value !== 'function');
}

function formatEachValue(value) {
  return runtimePrettyFormatter
    ? runtimePrettyFormatter(value, {maxDepth: 1, min: true})
    : inspect(value, {breakLength: Infinity, compact: true, depth: 1});
}

function beforeAll(callback, timeout) {
  defineHook('beforeAll', callback, timeout);
}
function afterAll(callback, timeout) {
  defineHook('afterAll', callback, timeout);
}
function beforeEach(callback, timeout) {
  defineHook('beforeEach', callback, timeout);
}
function afterEach(callback, timeout) {
  defineHook('afterEach', callback, timeout);
}

Object.assign(globalThis, {
  describe,
  fdescribe: describe.only,
  xdescribe: describe.skip,
  test,
  it,
  fit: test.only,
  xit: test.skip,
  xtest: test.skip,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
});

class RjestAssertionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RjestAssertionError';
  }
}

function printable(value) {
  return inspect(value, {
    depth: 8,
    colors: false,
    sorted: true,
    breakLength: 80,
  });
}

function asymmetric(match, description, sample, inverse = false) {
  return {
    $$typeof: Symbol.for('jest.asymmetricMatcher'),
    sample,
    inverse,
    [ASYMMETRIC]: true,
    asymmetricMatch: match,
    toString: () => description,
    toAsymmetricMatcher: () =>
      description === 'Any' ? `Any<${sample?.name ?? 'anonymous'}>` : description,
  };
}

function isAsymmetric(value) {
  return Boolean(
    value && value[ASYMMETRIC] && typeof value.asymmetricMatch === 'function',
  );
}

function isErrorLike(value) {
  return (
    value instanceof Error ||
    Object.prototype.toString.call(value) === '[object Error]'
  );
}

function enumerableKeys(value, strict) {
  return Reflect.ownKeys(value).filter(key => {
    if (!Object.prototype.propertyIsEnumerable.call(value, key)) return false;
    return strict || value[key] !== undefined;
  });
}

function deepEqual(received, expected, strict = false, receivedStack = [], expectedStack = []) {
  if (isAsymmetric(expected)) return expected.asymmetricMatch(received);
  if (isAsymmetric(received)) return received.asymmetricMatch(expected);
  if (Object.is(received, expected)) return true;
  if (received instanceof Error && expected instanceof Error) {
    return received.message === expected.message;
  }
  if (
    typeof received !== 'object' ||
    received === null ||
    typeof expected !== 'object' ||
    expected === null
  ) {
    return false;
  }
  const receivedTag = Object.prototype.toString.call(received);
  if (receivedTag !== Object.prototype.toString.call(expected)) return false;
  if (
    receivedTag === '[object Boolean]' ||
    receivedTag === '[object String]' ||
    receivedTag === '[object Number]'
  ) {
    return Object.is(received.valueOf(), expected.valueOf());
  }
  if (
    strict &&
    Object.getPrototypeOf(received) !== Object.getPrototypeOf(expected)
  ) {
    return false;
  }
  if (received instanceof Date || expected instanceof Date) {
    return (
      received instanceof Date &&
      expected instanceof Date &&
      received.getTime() === expected.getTime()
    );
  }
  if (received instanceof RegExp || expected instanceof RegExp) {
    return (
      received instanceof RegExp &&
      expected instanceof RegExp &&
      received.source === expected.source &&
      received.flags === expected.flags
    );
  }
  if (receivedTag === '[object URL]') return received.href === expected.href;
  if (
    typeof received.isEqualNode === 'function' &&
    typeof expected.isEqualNode === 'function'
  ) {
    return received.isEqualNode(expected);
  }
  for (let index = receivedStack.length - 1; index >= 0; index -= 1) {
    if (receivedStack[index] === received) {
      return expectedStack[index] === expected;
    }
    if (expectedStack[index] === expected) return false;
  }
  receivedStack.push(received);
  expectedStack.push(expected);
  let result;
  if (received instanceof Map || expected instanceof Map) {
    if (
      !(received instanceof Map && expected instanceof Map) ||
      received.size !== expected.size
    ) {
      result = false;
    } else {
      const remaining = [...expected.entries()];
      result = [...received.entries()].every(([key, value]) => {
        const index = remaining.findIndex(
          ([otherKey, otherValue]) =>
            deepEqual(
              key,
              otherKey,
              strict,
              receivedStack,
              expectedStack,
            ) &&
            deepEqual(
              value,
              otherValue,
              strict,
              receivedStack,
              expectedStack,
            ),
        );
        if (index < 0) return false;
        remaining.splice(index, 1);
        return true;
      });
    }
  } else if (received instanceof Set || expected instanceof Set) {
    if (
      !(received instanceof Set && expected instanceof Set) ||
      received.size !== expected.size
    ) {
      result = false;
    } else {
      const remaining = [...expected.values()];
      result = [...received.values()].every(value => {
        const index = remaining.findIndex(other =>
          deepEqual(value, other, strict, receivedStack, expectedStack),
        );
        if (index < 0) return false;
        remaining.splice(index, 1);
        return true;
      });
    }
  } else if (
    ArrayBuffer.isView(received) ||
    received instanceof ArrayBuffer
  ) {
    result = isDeepStrictEqual(received, expected);
  } else if (
    strict &&
    Array.isArray(received) &&
    received.length !== expected.length
  ) {
    result = false;
  } else {
    const receivedKeys = enumerableKeys(received, strict);
    const expectedKeys = enumerableKeys(expected, strict);
    result =
      receivedKeys.length === expectedKeys.length &&
      expectedKeys.every(
        key =>
          receivedKeys.includes(key) &&
          deepEqual(
            received[key],
            expected[key],
            strict,
            receivedStack,
            expectedStack,
          ),
      );
  }
  receivedStack.pop();
  expectedStack.pop();
  return result;
}

function subsetEqual(received, expected, receivedStack = [], expectedStack = []) {
  if (isAsymmetric(expected)) return expected.asymmetricMatch(received);
  if (Object.is(received, expected)) return true;
  if (typeof expected !== 'object' || expected === null) {
    return deepEqual(received, expected);
  }
  if (typeof received !== 'object' || received === null) return false;
  for (let index = receivedStack.length - 1; index >= 0; index -= 1) {
    if (receivedStack[index] === received) {
      return expectedStack[index] === expected;
    }
    if (expectedStack[index] === expected) return false;
  }
  receivedStack.push(received);
  expectedStack.push(expected);
  const result = Reflect.ownKeys(expected)
    .filter(key => Object.prototype.propertyIsEnumerable.call(expected, key))
    .every(
      key =>
        key in Object(received) &&
        subsetEqual(
          received[key],
          expected[key],
          receivedStack,
          expectedStack,
        ),
    );
  receivedStack.pop();
  expectedStack.pop();
  return result;
}

function propertyPath(path) {
  if (Array.isArray(path)) return path;
  return String(path)
    .replace(
      /\[(?:'([^']*)'|"([^"]*)"|(\d+))\]/g,
      (_, single, double, number) => `.${single ?? double ?? number}`,
    )
    .split('.')
    .filter(Boolean);
}

function resolveProperty(received, path) {
  let current = received;
  for (const segment of propertyPath(path)) {
    if (
      current === null ||
      current === undefined ||
      !(segment in Object(current))
    ) {
      return {found: false};
    }
    current = current[segment];
  }
  return {found: true, value: current};
}

function prettyFormat(value, indentation = '', stack = []) {
  if (isAsymmetric(value)) return value.toAsymmetricMatcher();
  if (value === true || value === false || value === null || value === undefined) {
    return String(value);
  }
  if (typeof value === 'number') return Object.is(value, -0) ? '-0' : String(value);
  if (typeof value === 'bigint') return `${value}n`;
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'function') return '[Function]';
  if (typeof value === 'symbol') return String(value).replace(/\)(.*)$/, ')');
  if (stack.includes(value)) return '[Circular]';
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? 'Date { NaN }' : value.toISOString();
  }
  if (value instanceof Error) return `[${String(value)}]`;
  if (value instanceof RegExp) {
    return String(value).replace(/[$()*+.?[\\\]^{|}]/g, '\\$&');
  }
  if (value instanceof Promise) return 'Promise {}';
  if (value instanceof WeakMap) return 'WeakMap {}';
  if (value instanceof WeakSet) return 'WeakSet {}';
  if (typeof value.toJSON === 'function') {
    return prettyFormat(value.toJSON(), indentation, [...stack, value]);
  }

  const nextIndent = `${indentation}  `;
  const references = [...stack, value];
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    const prefix = Array.isArray(value) ? '' : `${value.constructor.name} `;
    if (value.length === 0) return `${prefix}[]`;
    const items = [...value]
      .map(item => `${nextIndent}${prettyFormat(item, nextIndent, references)},`)
      .join('\n');
    return `${prefix}[\n${items}\n${indentation}]`;
  }
  if (value instanceof Map) {
    if (value.size === 0) return 'Map {}';
    const entries = [...value.entries()]
      .map(
        ([key, item]) =>
          `${nextIndent}${prettyFormat(key, nextIndent, references)} => ${prettyFormat(item, nextIndent, references)},`,
      )
      .join('\n');
    return `Map {\n${entries}\n${indentation}}`;
  }
  if (value instanceof Set) {
    if (value.size === 0) return 'Set {}';
    const items = [...value]
      .map(item => `${nextIndent}${prettyFormat(item, nextIndent, references)},`)
      .join('\n');
    return `Set {\n${items}\n${indentation}}`;
  }

  const keys = Reflect.ownKeys(value).filter(key =>
    Object.prototype.propertyIsEnumerable.call(value, key),
  );
  const constructor = value.constructor?.name;
  const prefix = constructor && constructor !== 'Object' ? `${constructor} ` : '';
  if (keys.length === 0) return `${prefix}{}`;
  const properties = keys
    .map(
      key =>
        `${nextIndent}${prettyFormat(key, nextIndent, references)}: ${prettyFormat(value[key], nextIndent, references)},`,
    )
    .join('\n');
  return `${prefix}{\n${properties}\n${indentation}}`;
}

function formatSnapshot(value, escapeString = false) {
  const formatterOptions = {
    escapeRegex: true,
    escapeString,
    plugins: [...runtimeSnapshotSerializers, ...runtimePrettyFormatPlugins],
    printFunctionName: false,
  };
  if (runtimePrettyFormatSupportsBasicPrototype) {
    formatterOptions.printBasicPrototype = false;
  }
  const serialized = runtimePrettyFormatter
    ? runtimePrettyFormatter(value, formatterOptions)
    : prettyFormat(value);
  return serialized.includes('\n') ? `\n${serialized}\n` : serialized;
}

function stripInlineSnapshotIndentation(inlineSnapshot) {
  const match = inlineSnapshot.match(/^([^\S\n]*)\S/m);
  if (!match?.[1]) return inlineSnapshot;
  const indentation = match[1];
  const lines = inlineSnapshot.split('\n');
  if (
    lines.length <= 2 ||
    lines[0].trim() !== '' ||
    lines.at(-1).trim() !== ''
  ) {
    return inlineSnapshot;
  }
  for (let index = 1; index < lines.length - 1; index += 1) {
    if (lines[index] === '') continue;
    if (!lines[index].startsWith(indentation)) return inlineSnapshot;
    lines[index] = lines[index].slice(indentation.length);
  }
  lines[lines.length - 1] = '';
  return lines.join('\n');
}

function inlineSnapshotFrame(error) {
  const testPath = normalizedRuntimePath(request.testPath);
  for (const line of String(error?.stack ?? '').split('\n')) {
    const trimmed = line.trim();
    const parenthesized = trimmed.match(/\((.+:\d+:\d+)\)$/)?.[1];
    const location =
      parenthesized ?? trimmed.replace(/^at\s+(?:async\s+)?/, '');
    const match = location.match(/^(.*):(\d+):(\d+)$/);
    if (!match) continue;
    let file = match[1];
    try {
      if (file.startsWith('file:')) file = fileURLToPath(file);
    } catch {
      continue;
    }
    if (normalizedRuntimePath(file) !== testPath) continue;
    return {
      file: request.testPath,
      line: Number.parseInt(match[2], 10),
      column: Number.parseInt(match[3], 10),
    };
  }
  throw new Error("Jest: Couldn't infer stack frame for inline snapshot.");
}

let inlineSnapshotTools;

function loadUnmockedRuntimeTool(specifier) {
  const resolved = requireFromTest.resolve(specifier);
  bypassModuleMocks.add(resolved);
  transformerDepth += 1;
  try {
    return requireFromTest(resolved);
  } finally {
    transformerDepth -= 1;
    bypassModuleMocks.delete(resolved);
  }
}

function getInlineSnapshotTools() {
  if (inlineSnapshotTools) return inlineSnapshotTools;
  const babel = loadUnmockedRuntimeTool('@babel/core');
  const loadedGenerator = loadUnmockedRuntimeTool('@babel/generator');
  const traceMapping = loadUnmockedRuntimeTool('@jridgewell/trace-mapping');
  inlineSnapshotTools = {
    babel,
    generate: loadedGenerator.default ?? loadedGenerator,
    traceMapping,
  };
  return inlineSnapshotTools;
}

function originalInlineSnapshotFrame(frame) {
  const sourceMap = runtimeSourceMaps.get(normalizedRuntimePath(frame.file));
  if (!sourceMap) return frame;
  const {traceMapping} = getInlineSnapshotTools();
  const original = traceMapping.originalPositionFor(
    new traceMapping.TraceMap(sourceMap),
    {line: frame.line, column: frame.column - 1},
  );
  if (original.line == null || original.column == null) return frame;
  return {...frame, line: original.line, column: original.column + 1};
}

function escapeInlineSnapshot(snapshot) {
  return snapshot.replaceAll(/`|\\|\${/g, '\\$&');
}

function inlineSnapshotParserPlugins(path) {
  const extension = extname(path);
  const plugins = [];
  if (extension.endsWith('x')) plugins.push('jsx');
  if (/\.[cm]?tsx?$/.test(extension)) {
    plugins.push(['typescript', {isTSX: extension.endsWith('x')}]);
  }
  return plugins;
}

function indentInlineSnapshot(snapshot, numIndents, indentation) {
  const lines = snapshot.split('\n');
  if (
    lines.length >= 2 &&
    lines[1].startsWith(indentation.repeat(numIndents + 1))
  ) {
    return snapshot;
  }
  return lines
    .map((line, index) => {
      if (index === 0) return line;
      if (index === lines.length - 1) {
        return indentation.repeat(numIndents) + line;
      }
      return line === ''
        ? line
        : indentation.repeat(numIndents + 1) + line;
    })
    .join('\n');
}

function formatInlineSnapshotAst(ast, options, matcherNames) {
  const {babel} = getInlineSnapshotTools();
  babel.types.traverse(ast, (node, ancestors) => {
    const property = node.callee?.property;
    if (
      node.type !== 'CallExpression' ||
      node.callee?.type !== 'MemberExpression' ||
      property?.type !== 'Identifier' ||
      !matcherNames.has(property.name) ||
      !node.callee.loc ||
      node.callee.computed
    ) {
      return;
    }
    const snapshotArgument = node.arguments.find(
      argument => argument.type === 'TemplateLiteral',
    );
    if (!snapshotArgument) return;
    const parent = ancestors.at(-1)?.node;
    const startColumn =
      parent?.type === 'AwaitExpression' && parent.loc
        ? parent.loc.start.column
        : node.callee.loc.start.column;
    const useSpaces = !options?.useTabs;
    const indentation = useSpaces
      ? ' '.repeat(options?.tabWidth ?? 1)
      : '\t';
    const numIndents = Math.ceil(
      useSpaces
        ? startColumn / (options?.tabWidth ?? 1)
        : startColumn / 2,
    );
    snapshotArgument.quasis[0].value.raw = indentInlineSnapshot(
      snapshotArgument.quasis[0].value.raw,
      numIndents,
      indentation,
    );
  });
}

async function loadConfiguredPrettier(sourcePath) {
  const sourceRequire = createRequire(sourcePath);
  let resolved;
  try {
    resolved = sourceRequire.resolve(request.prettierPath);
  } catch (error) {
    if (error?.code === 'MODULE_NOT_FOUND') return null;
    throw error;
  }
  bypassModuleMocks.add(resolved);
  transformerDepth += 1;
  try {
    let loaded;
    try {
      loaded = sourceRequire(resolved);
    } catch (error) {
      if (
        error?.code !== 'ERR_REQUIRE_ESM' &&
        error?.code !== 'ERR_REQUIRE_ASYNC_MODULE'
      ) {
        throw error;
      }
      loaded = await import(pathToFileURL(resolved).href);
    }
    return typeof loaded?.format === 'function' ? loaded : loaded.default;
  } finally {
    transformerDepth -= 1;
    bypassModuleMocks.delete(resolved);
  }
}

async function formatInlineSnapshotsWithPrettier(
  path,
  source,
  matcherNames,
) {
  const prettier = await loadConfiguredPrettier(path);
  if (!prettier) return source;
  const config =
    typeof prettier.resolveConfig === 'function'
      ? await prettier.resolveConfig(path, {editorconfig: true})
      : null;
  const fileInfo =
    typeof prettier.getFileInfo === 'function'
      ? await prettier.getFileInfo(path)
      : undefined;
  const inferredParser =
    (typeof config?.parser === 'string' && config.parser) ||
    fileInfo?.inferredParser;
  if (!inferredParser) {
    throw new Error(`Could not infer Prettier parser for file ${path}`);
  }
  const formatOptions = {...config, filepath: path, parser: inferredParser};
  const formatted = await prettier.format(source, formatOptions);
  const majorVersion = Number.parseInt(String(prettier.version), 10);
  if (majorVersion < 3) {
    return prettier.format(formatted, {
      ...config,
      filepath: path,
      parser(text, parsers, options) {
        options.parser = inferredParser;
        const ast = parsers[inferredParser](text, options);
        formatInlineSnapshotAst(ast, options, matcherNames);
        return ast;
      },
    });
  }
  const parsed = await prettier.__debug.parse(formatted, {
    ...formatOptions,
    originalText: formatted,
  });
  formatInlineSnapshotAst(parsed.ast, config, matcherNames);
  const formattedAst = await prettier.__debug.formatAST(parsed.ast, {
    ...formatOptions,
    originalText: parsed.text,
  });
  return formattedAst.formatted;
}

async function rewriteInlineSnapshotFile(path, updates) {
  const {babel, generate} = getInlineSnapshotTools();
  const source = readFileSync(path, 'utf8');
  const ast = babel.parseSync(source, {
    babelrc: false,
    configFile: false,
    filename: path,
    parserOpts: {
      plugins: inlineSnapshotParserPlugins(path),
      sourceType: 'unambiguous',
    },
  });
  if (!ast) throw new Error(`jest-snapshot: Failed to parse ${path}`);

  const updatesByLocation = new Map();
  for (const update of updates) {
    const frame = originalInlineSnapshotFrame(update.frame);
    const key = `${frame.line}:${frame.column - 1}`;
    const atLocation = updatesByLocation.get(key) ?? [];
    atLocation.push(update);
    updatesByLocation.set(key, atLocation);
  }
  const replacements = [];
  const matcherNames = new Set();
  babel.traverse(ast, {
    CallExpression(nodePath) {
      const node = nodePath.node;
      const property = node.callee?.property;
      if (
        node.callee?.type !== 'MemberExpression' ||
        property?.type !== 'Identifier' ||
        !property.loc ||
        node.callee.computed
      ) {
        return;
      }
      const key = `${property.loc.start.line}:${property.loc.start.column}`;
      const atLocation = updatesByLocation.get(key);
      if (!atLocation) return;
      if (atLocation.length > 1) {
        throw new Error(
          'Jest: Multiple inline snapshots for the same call are not supported.',
        );
      }
      const update = atLocation[0];
      matcherNames.add(property.name);
      const replacement = babel.types.templateLiteral(
        [
          babel.types.templateElement({
            raw: escapeInlineSnapshot(update.snapshot),
          }),
        ],
        [],
      );
      const snapshotIndex = node.arguments.findIndex(
        argument =>
          argument.type === 'TemplateLiteral' || argument.type === 'StringLiteral',
      );
      if (snapshotIndex === -1) node.arguments.push(replacement);
      else node.arguments[snapshotIndex] = replacement;
      if (
        typeof node.start !== 'number' ||
        typeof node.end !== 'number' ||
        !node.loc
      ) {
        throw new Error('Jest: no snapshot insert location found');
      }
      node.loc.end.line = node.loc.start.line;
      replacements.push({
        start: node.start,
        end: node.end,
        code: generate(node, {retainLines: true}).code.trim(),
      });
      updatesByLocation.delete(key);
    },
  });
  if (updatesByLocation.size > 0) {
    throw new Error("Jest: Couldn't locate all inline snapshots.");
  }
  let rewritten = source;
  replacements.sort((left, right) => right.start - left.start);
  for (const replacement of replacements) {
    rewritten =
      rewritten.slice(0, replacement.start) +
      replacement.code +
      rewritten.slice(replacement.end);
  }
  if (request.prettierPath) {
    rewritten = await formatInlineSnapshotsWithPrettier(
      path,
      rewritten,
      matcherNames,
    );
  }
  if (rewritten !== source) writeFileSync(path, rewritten);
}

async function persistInlineSnapshots() {
  const byFile = new Map();
  for (const update of snapshotState.inlineUpdates) {
    const path = update.frame.file;
    const updates = byFile.get(path) ?? [];
    updates.push(update);
    byFile.set(path, updates);
  }
  for (const [path, updates] of byFile) {
    await rewriteInlineSnapshotFile(path, updates);
  }
}

function normalizeSnapshotName(value) {
  return value.replace(/\r\n|\r|\n/g, ending => {
    if (ending === '\r\n') return '\\r\\n';
    if (ending === '\r') return '\\r';
    return '\\n';
  });
}

function markSnapshotsChecked(testName) {
  const normalized = normalizeSnapshotName(testName);
  for (const key of snapshotState.unchecked) {
    const keyName = key.replace(/ \d+$/, '');
    if (keyName === normalized || keyName.startsWith(`${normalized}: `)) {
      snapshotState.unchecked.delete(key);
    }
  }
}

function snapshotAttemptRecord(test = activeTest) {
  if (!test) return undefined;
  let record = snapshotState.attempts.get(test);
  if (!record) {
    record = {
      checkedKeys: new Set(),
      counters: new Map(),
      counts: {added: 0, matched: 0, unmatched: 0, updated: 0},
      data: new Map(),
      inlineUpdates: new Set(),
      writes: undefined,
    };
    snapshotState.attempts.set(test, record);
  }
  return record;
}

function bumpSnapshotCounter(testName) {
  const record = snapshotAttemptRecord();
  if (record && !record.counters.has(testName)) {
    record.counters.set(testName, snapshotState.counts.get(testName));
  }
  const count = (snapshotState.counts.get(testName) ?? 0) + 1;
  snapshotState.counts.set(testName, count);
  return count;
}

function markSnapshotChecked(key) {
  if (snapshotState.unchecked.delete(key)) {
    snapshotAttemptRecord()?.checkedKeys.add(key);
  }
}

function recordSnapshotData(key) {
  const record = snapshotAttemptRecord();
  if (record && !record.data.has(key)) {
    record.data.set(
      key,
      Object.prototype.hasOwnProperty.call(snapshotState.data, key)
        ? snapshotState.data[key]
        : undefined,
    );
  }
}

function incrementSnapshotCount(status) {
  snapshotState[status] += 1;
  const record = snapshotAttemptRecord();
  if (record) record.counts[status] += 1;
}

function recordSnapshotWrite() {
  const record = snapshotAttemptRecord();
  if (record) {
    record.writes ??= {
      dirtyBefore: snapshotState.dirty,
      ownWrites: 0,
      writeCountBefore: snapshotState.writeCount,
    };
    record.writes.ownWrites += 1;
  }
  snapshotState.writeCount += 1;
  snapshotState.dirty = true;
}

function recordInlineSnapshotUpdate(frame, snapshot) {
  const update = {frame, snapshot};
  snapshotState.inlineUpdates.push(update);
  snapshotAttemptRecord()?.inlineUpdates.add(update);
}

function clearSnapshotAttempt(test) {
  const record = snapshotState.attempts.get(test);
  if (!record) return;
  snapshotState.attempts.delete(test);
  for (const status of ['added', 'matched', 'unmatched', 'updated']) {
    snapshotState[status] -= record.counts[status];
  }
  for (const [key, previous] of record.data) {
    if (previous === undefined) delete snapshotState.data[key];
    else snapshotState.data[key] = previous;
  }
  snapshotState.inlineUpdates = snapshotState.inlineUpdates.filter(
    update => !record.inlineUpdates.has(update),
  );
  for (const key of record.checkedKeys) snapshotState.unchecked.add(key);
  for (const [testName, previous] of record.counters) {
    if (previous === undefined) snapshotState.counts.delete(testName);
    else snapshotState.counts.set(testName, previous);
  }
  const writes = record.writes;
  if (
    writes &&
    snapshotState.writeCount - writes.writeCountBefore === writes.ownWrites
  ) {
    snapshotState.dirty = writes.dirtyBefore;
    snapshotState.writeCount = writes.writeCountBefore;
  }
}

function mergeSnapshotProperties(target, source) {
  if (isAsymmetric(source)) return source;
  if (Array.isArray(target) && Array.isArray(source)) {
    const merged = [...target];
    for (const [index, sourceValue] of source.entries()) {
      const targetValue = merged[index];
      merged[index] =
        (Array.isArray(targetValue) && Array.isArray(sourceValue)) ||
        (targetValue !== null &&
          typeof targetValue === 'object' &&
          sourceValue !== null &&
          typeof sourceValue === 'object' &&
          !isAsymmetric(sourceValue))
          ? mergeSnapshotProperties(targetValue, sourceValue)
          : sourceValue;
    }
    return merged;
  }
  if (
    target !== null &&
    typeof target === 'object' &&
    !Array.isArray(target) &&
    source !== null &&
    typeof source === 'object' &&
    !Array.isArray(source)
  ) {
    const merged = {...target};
    for (const key of Object.keys(source)) {
      const sourceValue = source[key];
      merged[key] =
        key in Object(target) &&
        sourceValue !== null &&
        typeof sourceValue === 'object' &&
        !isAsymmetric(sourceValue)
          ? mergeSnapshotProperties(target[key], sourceValue)
          : sourceValue;
    }
    return merged;
  }
  return target;
}

function applySnapshotProperties(received, properties) {
  if (typeof properties !== 'object' || properties === null) {
    throw new Error('Snapshot properties must be a non-null object');
  }
  if (typeof received !== 'object' || received === null) {
    throw new Error(
      'Received value must be an object when snapshot properties are provided',
    );
  }
  if (!subsetEqual(received, properties)) {
    throw new RjestAssertionError(
      `Snapshot properties did not match\nExpected properties: ${printable(properties)}\nReceived: ${printable(received)}`,
    );
  }
  return mergeSnapshotProperties(received, properties);
}

function matchSnapshot(received, hint) {
  if (!activeTest) {
    throw new Error('toMatchSnapshot must be called while a test is running');
  }
  const testName = hint
    ? `${fullName(activeTest)}: ${String(hint)}`
    : fullName(activeTest);
  const normalizedName = normalizeSnapshotName(testName);
  const count = bumpSnapshotCounter(normalizedName);
  const key = `${normalizedName} ${count}`;
  markSnapshotChecked(key);
  const receivedSerialized = formatSnapshot(received);
  const hasSnapshot = Object.prototype.hasOwnProperty.call(snapshotState.data, key);
  const expected = snapshotState.data[key];

  const legacySerialized = hasSnapshot
    ? formatSnapshot(received, true)
    : undefined;
  if (
    hasSnapshot &&
    (expected === receivedSerialized || expected === legacySerialized)
  ) {
    incrementSnapshotCount('matched');
    recordSnapshotData(key);
    snapshotState.data[key] = receivedSerialized;
    return {pass: true, key};
  }
  if (hasSnapshot && snapshotState.update === 'all') {
    incrementSnapshotCount('updated');
    recordSnapshotData(key);
    recordSnapshotWrite();
    snapshotState.data[key] = receivedSerialized;
    return {pass: true, key};
  }
  if (
    !hasSnapshot &&
    (snapshotState.update === 'new' || snapshotState.update === 'all')
  ) {
    incrementSnapshotCount('added');
    recordSnapshotData(key);
    recordSnapshotWrite();
    snapshotState.data[key] = receivedSerialized;
    return {pass: true, key};
  }

  incrementSnapshotCount('unmatched');
  return {
    pass: false,
    key,
    message:
      `Snapshot name: ${key}\n` +
      `Expected: ${expected === undefined ? 'snapshot is missing' : expected}\n` +
      `Received: ${receivedSerialized}`,
  };
}

const matchers = {
  toBe: (received, expected) => Object.is(received, expected),
  toEqual: (received, expected) => deepEqual(received, expected),
  toStrictEqual: (received, expected) => deepEqual(received, expected, true),
  toBeTruthy: received => Boolean(received),
  toBeFalsy: received => !received,
  toBeNull: received => received === null,
  toBeUndefined: received => received === undefined,
  toBeDefined: received => received !== undefined,
  toBeNaN: received => Number.isNaN(received),
  toContain: (received, expected) =>
    typeof received === 'string'
      ? received.includes(expected)
      : received != null &&
        [...received].some(value => Object.is(value, expected)),
  toContainEqual: (received, expected) =>
    received != null &&
    [...received].some(value => deepEqual(value, expected)),
  toHaveLength: (received, expected) =>
    received != null && received.length === expected,
  toHaveProperty: (received, path, expected, expectedProvided) => {
    const property = resolveProperty(received, path);
    return (
      property.found &&
      (!expectedProvided || deepEqual(property.value, expected))
    );
  },
  toMatch: (received, expected) =>
    typeof received === 'string' &&
    (expected instanceof RegExp
      ? expected.test(received)
      : received.includes(String(expected))),
  toMatchObject: (received, expected) => subsetEqual(received, expected),
  toBeInstanceOf: (received, expected) =>
    typeof expected === 'function' && received instanceof expected,
  toBeGreaterThan: (received, expected) => received > expected,
  toBeGreaterThanOrEqual: (received, expected) => received >= expected,
  toBeLessThan: (received, expected) => received < expected,
  toBeLessThanOrEqual: (received, expected) => received <= expected,
  toBeCloseTo: (received, expected, digits = 2) =>
    Math.abs(received - expected) < Math.pow(10, -digits) / 2,
  toThrow: (received, expected) => {
    if (typeof received !== 'function') {
      throw new TypeError('Received value must be a function');
    }
    let thrown;
    try {
      received();
    } catch (error) {
      thrown = error;
    }
    if (thrown === undefined) return false;
    if (expected === undefined) return true;
    if (typeof expected === 'string') {
      return String(thrown?.message ?? thrown).includes(expected);
    }
    if (expected instanceof RegExp) {
      return expected.test(String(thrown?.message ?? thrown));
    }
    if (isAsymmetric(expected)) return expected.asymmetricMatch(thrown);
    if (typeof expected === 'function') return thrown instanceof expected;
    if (expected instanceof Error) return thrown?.message === expected.message;
    if (typeof expected === 'object' && expected !== null) {
      return subsetEqual(thrown, expected);
    }
    return false;
  },
  toHaveBeenCalled: received =>
    isMock(received) && received.mock.calls.length > 0,
  toHaveBeenCalledTimes: (received, expected) =>
    isMock(received) && received.mock.calls.length === expected,
  toHaveBeenCalledWith: (received, ...expected) =>
    isMock(received) &&
    received.mock.calls.some(call => deepEqual(call, expected)),
  toHaveBeenLastCalledWith: (received, ...expected) =>
    isMock(received) &&
    received.mock.calls.length > 0 &&
    deepEqual(received.mock.calls.at(-1), expected),
  toHaveBeenNthCalledWith: (received, nth, ...expected) =>
    isMock(received) &&
    Number.isInteger(nth) &&
    nth > 0 &&
    received.mock.calls.length >= nth &&
    deepEqual(received.mock.calls[nth - 1], expected),
  toHaveReturned: received =>
    isMock(received) &&
    received.mock.results.some(result => result.type === 'return'),
  toHaveReturnedTimes: (received, expected) =>
    isMock(received) &&
    received.mock.results.filter(result => result.type === 'return').length ===
      expected,
  toHaveReturnedWith: (received, expected) =>
    isMock(received) &&
    received.mock.results.some(
      result => result.type === 'return' && deepEqual(result.value, expected),
    ),
};
Object.assign(matchers, {
  toBeCalled: matchers.toHaveBeenCalled,
  toBeCalledTimes: matchers.toHaveBeenCalledTimes,
  toBeCalledWith: matchers.toHaveBeenCalledWith,
  lastCalledWith: matchers.toHaveBeenLastCalledWith,
  nthCalledWith: matchers.toHaveBeenNthCalledWith,
  toHaveNthBeenCalledWith: matchers.toHaveBeenNthCalledWith,
  toReturn: matchers.toHaveReturned,
  toReturnTimes: matchers.toHaveReturnedTimes,
  toReturnWith: matchers.toHaveReturnedWith,
  toThrowError: matchers.toThrow,
});

function matcherMessage(name, received, expected, isNot) {
  const expectedLabel =
    expected.length === 0
      ? ''
      : `\nExpected: ${printable(
          expected.length === 1 ? expected[0] : expected,
        )}`;
  const receivedLabel = isMock(received)
    ? `\nReceived calls: ${printable(received.mock.calls)}`
    : `\nReceived: ${printable(received)}`;
  return `expect(received)${isNot ? '.not' : ''}.${name}()${expectedLabel}${receivedLabel}`;
}

function validateCustomMatcherOutcome(
  name,
  outcome,
  received,
  expected,
  isNot,
) {
  if (
    !outcome ||
    typeof outcome !== 'object' ||
    typeof outcome.pass !== 'boolean'
  ) {
    throw new TypeError(
      `Unexpected return from a matcher function: ${name} must return an object with a boolean pass property`,
    );
  }
  if (outcome.pass === isNot) {
    const message =
      typeof outcome.message === 'function'
        ? outcome.message()
        : matcherMessage(name, received, expected, isNot);
    throw new RjestAssertionError(message);
  }
}

function recordAssertion() {
  if (activeTest) {
    activeTest.assertionCalls += 1;
    expectState.assertionCalls = activeTest.assertionCalls;
  }
}

function makeExpectation(actual, isNot = false, promiseMode = undefined) {
  const expectation = {};
  Object.defineProperty(expectation, 'not', {
    get: () => makeExpectation(actual, !isNot, promiseMode),
  });
  Object.defineProperty(expectation, 'resolves', {
    get: () => makeExpectation(actual, isNot, 'resolves'),
  });
  Object.defineProperty(expectation, 'rejects', {
    get: () => makeExpectation(actual, isNot, 'rejects'),
  });
  for (const [name, matcher] of Object.entries(matchers)) {
    expectation[name] = (...expected) => {
      recordAssertion();
      const evaluate = received => {
        const args =
          name === 'toHaveProperty'
            ? [...expected, expected.length > 1]
            : expected;
        let matcherReceived = received;
        if (promiseMode && name === 'toThrow') {
          matcherReceived = isErrorLike(received)
            ? () => {
                throw received;
              }
            : typeof received === 'function'
              ? received
              : () => {};
        }
        const pass = Boolean(matcher(matcherReceived, ...args));
        if (pass === isNot) {
          throw new RjestAssertionError(
            matcherMessage(name, received, expected, isNot),
          );
        }
      };
      if (!promiseMode) return evaluate(actual);
      let promise;
      try {
        promise =
          typeof actual === 'function' && promiseMode === 'rejects'
            ? actual()
            : actual;
      } catch (error) {
        promise = Promise.reject(error);
      }
      if (!promise || typeof promise.then !== 'function') {
        return Promise.reject(
          new RjestAssertionError(
            `Received value must be a Promise for .${promiseMode}`,
          ),
        );
      }
      return Promise.resolve(promise).then(
        value => {
          if (promiseMode === 'rejects') {
            throw new RjestAssertionError(
              'Received promise resolved instead of rejected',
            );
          }
          return evaluate(value);
        },
        reason => {
          if (promiseMode === 'resolves') {
            throw new RjestAssertionError(
              `Received promise rejected instead of resolved: ${printable(reason)}`,
            );
          }
          return evaluate(reason);
        },
      );
    };
  }
  for (const [name, matcher] of customMatchers) {
    expectation[name] = (...expected) => {
      recordAssertion();
      const evaluate = received => {
        const outcome = matcher.call(
          {
            isNot,
            promise: promiseMode ?? '',
            equals: deepEqual,
            utils: {
              printExpected: printable,
              printReceived: printable,
              matcherHint: matcherName => `expect(received).${matcherName}`,
            },
          },
          received,
          ...expected,
        );
        if (outcome && typeof outcome.then === 'function') {
          return Promise.resolve(outcome).then(result =>
            validateCustomMatcherOutcome(name, result, received, expected, isNot),
          );
        }
        return validateCustomMatcherOutcome(
          name,
          outcome,
          received,
          expected,
          isNot,
        );
      };
      if (!promiseMode) return evaluate(actual);
      if (!actual || typeof actual.then !== 'function') {
        return Promise.reject(
          new RjestAssertionError(
            `Received value must be a Promise for .${promiseMode}`,
          ),
        );
      }
      return Promise.resolve(actual).then(
        value => {
          if (promiseMode === 'rejects') {
            throw new RjestAssertionError(
              'Received promise resolved instead of rejected',
            );
          }
          return evaluate(value);
        },
        reason => {
          if (promiseMode === 'resolves') {
            throw new RjestAssertionError(
              `Received promise rejected instead of resolved: ${printable(reason)}`,
            );
          }
          return evaluate(reason);
        },
      );
    };
  }

  expectation.toMatchSnapshot = (...arguments_) => {
    recordAssertion();
    if (isNot) {
      throw new Error('Snapshot matchers cannot be used with .not');
    }
    if (arguments_.length > 2) {
      throw new Error('toMatchSnapshot accepts properties and an optional hint');
    }
    const hasProperties =
      arguments_.length === 2 ||
      (arguments_.length === 1 && typeof arguments_[0] !== 'string');
    const properties = hasProperties ? arguments_[0] : undefined;
    const hint = hasProperties ? arguments_[1] : arguments_[0];
    const evaluate = received => {
      const snapshotReceived =
        !hasProperties
          ? received
          : applySnapshotProperties(received, properties);
      const outcome = matchSnapshot(snapshotReceived, hint);
      if (!outcome.pass) throw new RjestAssertionError(outcome.message);
    };
    if (!promiseMode) return evaluate(actual);
    let promise;
    try {
      promise =
        typeof actual === 'function' && promiseMode === 'rejects'
          ? actual()
          : actual;
    } catch (error) {
      promise = Promise.reject(error);
    }
    if (!promise || typeof promise.then !== 'function') {
      return Promise.reject(
        new RjestAssertionError(
          `Received value must be a Promise for .${promiseMode}`,
        ),
      );
    }
    return Promise.resolve(promise).then(
      value => {
        if (promiseMode === 'rejects') {
          throw new RjestAssertionError(
            'Received promise resolved instead of rejected',
          );
        }
        return evaluate(value);
      },
      reason => {
        if (promiseMode === 'resolves') {
          throw new RjestAssertionError(
            `Received promise rejected instead of resolved: ${printable(reason)}`,
          );
        }
        return evaluate(reason);
      },
    );
  };
  expectation.toMatchInlineSnapshot = (...arguments_) => {
    recordAssertion();
    const callsiteError = new Error();
    if (isNot) {
      throw new Error('Snapshot matchers cannot be used with .not');
    }
    if (arguments_.length > 2) {
      throw new Error(
        'toMatchInlineSnapshot accepts properties and an optional inline snapshot',
      );
    }
    const hasProperties =
      arguments_.length > 1 ||
      (arguments_.length === 1 && typeof arguments_[0] !== 'string');
    const properties = hasProperties ? arguments_[0] : undefined;
    const inlineArgument = hasProperties ? arguments_[1] : arguments_[0];
    const inlineSnapshot =
      typeof inlineArgument === 'string'
        ? stripInlineSnapshotIndentation(inlineArgument)
        : undefined;
    const evaluate = received => {
      const snapshotReceived = hasProperties
        ? applySnapshotProperties(received, properties)
        : received;
      const serialized = formatSnapshot(snapshotReceived);
      if (inlineSnapshot === undefined) {
        if (
          snapshotState.update === 'new' ||
          snapshotState.update === 'all'
        ) {
          incrementSnapshotCount('added');
          recordInlineSnapshotUpdate(
            inlineSnapshotFrame(callsiteError),
            serialized,
          );
          return;
        }
        incrementSnapshotCount('unmatched');
        throw new RjestAssertionError(
          `Inline snapshot is missing\nReceived: ${serialized}`,
        );
      }
      if (serialized !== inlineSnapshot) {
        if (snapshotState.update === 'all') {
          incrementSnapshotCount('updated');
          recordInlineSnapshotUpdate(
            inlineSnapshotFrame(callsiteError),
            serialized,
          );
          return;
        }
        incrementSnapshotCount('unmatched');
        throw new RjestAssertionError(
          `Inline snapshot mismatch\nExpected: ${inlineSnapshot}\nReceived: ${serialized}`,
        );
      }
      incrementSnapshotCount('matched');
    };
    if (!promiseMode) return evaluate(actual);
    return Promise.resolve(actual).then(evaluate);
  };
  expectation.toThrowErrorMatchingInlineSnapshot = inlineSnapshot => {
    if (typeof actual !== 'function') {
      throw new TypeError('Received value must be a function');
    }
    let thrown;
    try {
      actual();
    } catch (error) {
      thrown = error;
    }
    if (thrown === undefined) {
      throw new RjestAssertionError('Received function did not throw');
    }
    const thrownExpectation = makeExpectation(thrown?.message ?? String(thrown));
    return inlineSnapshot === undefined
      ? thrownExpectation.toMatchInlineSnapshot()
      : thrownExpectation.toMatchInlineSnapshot(inlineSnapshot);
  };
  expectation.toThrowErrorMatchingSnapshot = hint => {
    recordAssertion();
    if (typeof actual !== 'function') {
      throw new TypeError('Received value must be a function');
    }
    let thrown;
    try {
      actual();
    } catch (error) {
      thrown = error;
    }
    if (thrown === undefined) {
      throw new RjestAssertionError('Received function did not throw');
    }
    const outcome = matchSnapshot(thrown?.message ?? String(thrown), hint);
    if (!outcome.pass) throw new RjestAssertionError(outcome.message);
  };
  return expectation;
}

function expect(actual) {
  return makeExpectation(actual);
}
expect.getState = () => expectState;
expect.setState = state => {
  if (!state || typeof state !== 'object') {
    throw new TypeError('expect.setState expects an object');
  }
  Object.assign(expectState, state);
};
expect.assertions = expected => {
  if (!Number.isSafeInteger(expected) || expected < 0) {
    throw new TypeError(
      'The expected assertion count must be a non-negative integer.',
    );
  }
  if (!activeTest) {
    throw new Error('expect.assertions() must be called from within a test.');
  }
  activeTest.expectedAssertions = expected;
  expectState.expectedAssertionsNumber = expected;
};
expect.hasAssertions = () => {
  if (!activeTest) {
    throw new Error('expect.hasAssertions() must be called from within a test.');
  }
  activeTest.requiresAssertions = true;
  expectState.isExpectingAssertions = true;
};
expect.anything = () =>
  asymmetric(
    value => value !== null && value !== undefined,
    'Anything',
  );
expect.any = constructor =>
  asymmetric(value => {
    if (constructor === String) {
      return typeof value === 'string' || value instanceof String;
    }
    if (constructor === Number) {
      return typeof value === 'number' || value instanceof Number;
    }
    if (constructor === Boolean) {
      return typeof value === 'boolean' || value instanceof Boolean;
    }
    if (constructor === BigInt) return typeof value === 'bigint';
    if (constructor === Symbol) return typeof value === 'symbol';
    return value instanceof constructor;
  }, 'Any', constructor);
expect.arrayContaining = sample =>
  asymmetric(
    value =>
      Array.isArray(value) &&
      sample.every(expected =>
        value.some(actual => deepEqual(actual, expected)),
      ),
    'ArrayContaining',
    sample,
  );
expect.objectContaining = sample =>
  asymmetric(value => subsetEqual(value, sample), 'ObjectContaining', sample);
expect.stringContaining = sample =>
  asymmetric(
    value => typeof value === 'string' && value.includes(String(sample)),
    'StringContaining',
    sample,
  );
expect.stringMatching = sample =>
  asymmetric(
    value =>
      typeof value === 'string' &&
      (sample instanceof RegExp
        ? sample.test(value)
        : value.includes(String(sample))),
    'StringMatching',
    sample,
  );
expect.extend = extensions => {
  if (!extensions || typeof extensions !== 'object') {
    throw new TypeError('expect.extend expects an object of matcher functions');
  }
  for (const [name, matcher] of Object.entries(extensions)) {
    if (typeof matcher !== 'function') {
      throw new TypeError(`Custom matcher ${name} must be a function`);
    }
    customMatchers.set(name, matcher);
  }
};
expect.not = {
  arrayContaining: sample =>
    asymmetric(
      value =>
        !(
          Array.isArray(value) &&
          sample.every(expected =>
            value.some(actual => deepEqual(actual, expected)),
          )
        ),
      'ArrayNotContaining',
      sample,
      true,
    ),
  objectContaining: sample =>
    asymmetric(
      value => !subsetEqual(value, sample),
      'ObjectNotContaining',
      sample,
      true,
    ),
  stringContaining: sample =>
    asymmetric(
      value =>
        !(typeof value === 'string' && value.includes(String(sample))),
      'StringNotContaining',
      sample,
      true,
    ),
  stringMatching: sample =>
    asymmetric(
      value =>
        !(
          typeof value === 'string' &&
          (sample instanceof RegExp
            ? sample.test(value)
            : value.includes(String(sample)))
        ),
      'StringNotMatching',
      sample,
      true,
    ),
};
globalThis.expect = expect;

function isMock(value) {
  return typeof value === 'function' && value._isMockFunction === true;
}

function matchMockArity(callback, length) {
  switch (length) {
    case 1:
      return function mockConstructor(_a) {
        return callback.apply(this, arguments);
      };
    case 2:
      return function mockConstructor(_a, _b) {
        return callback.apply(this, arguments);
      };
    case 3:
      return function mockConstructor(_a, _b, _c) {
        return callback.apply(this, arguments);
      };
    case 4:
      return function mockConstructor(_a, _b, _c, _d) {
        return callback.apply(this, arguments);
      };
    case 5:
      return function mockConstructor(_a, _b, _c, _d, _e) {
        return callback.apply(this, arguments);
      };
    case 6:
      return function mockConstructor(_a, _b, _c, _d, _e, _f) {
        return callback.apply(this, arguments);
      };
    case 7:
      return function mockConstructor(_a, _b, _c, _d, _e, _f, _g) {
        return callback.apply(this, arguments);
      };
    case 8:
      return function mockConstructor(_a, _b, _c, _d, _e, _f, _g, _h) {
        return callback.apply(this, arguments);
      };
    case 9:
      return function mockConstructor(_a, _b, _c, _d, _e, _f, _g, _h, _i) {
        return callback.apply(this, arguments);
      };
    default:
      return function mockConstructor() {
        return callback.apply(this, arguments);
      };
  }
}

function createMock(implementation) {
  let defaultImplementation = implementation;
  const once = [];
  let name = 'jest.fn()';
  let restore;
  let state = newMockState();
  let mock;
  const mockConstructor = function (...args) {
    const context = this;
    state.calls.push(args);
    state.contexts.push(context);
    state.instances.push(context);
    state.invocationCallOrder.push(++invocationOrder);
    state.lastCall = args;
    const result = {type: 'incomplete', value: undefined};
    state.results.push(result);
    let finalReturnValue;
    let thrownError;
    let callDidThrowError = false;
    try {
      finalReturnValue = (() => {
        let selected = once.shift();
        if (selected === undefined) selected = defaultImplementation;
        return selected ? selected.apply(context, args) : undefined;
      })();
      return finalReturnValue;
    } catch (error) {
      thrownError = error;
      callDidThrowError = true;
      throw error;
    } finally {
      result.type = callDidThrowError ? 'throw' : 'return';
      result.value = callDidThrowError ? thrownError : finalReturnValue;
    }
  };
  mock = matchMockArity(mockConstructor, implementation?.length ?? 0);
  Object.defineProperties(mock, {
    _isMockFunction: {value: true},
    mock: {get: () => state},
  });
  mock.mockClear = () => {
    state = newMockState();
    return mock;
  };
  mock.mockReset = () => {
    state = newMockState();
    once.length = 0;
    defaultImplementation = undefined;
    return mock;
  };
  mock.mockRestore = () => {
    mock.mockReset();
    const callback = restore;
    restore = undefined;
    if (callback) {
      restoreRegistry.delete(callback);
      callback();
    }
    return mock;
  };
  mock.mockImplementation = fn => {
    defaultImplementation = fn;
    return mock;
  };
  mock.mockImplementationOnce = fn => {
    once.push(fn);
    return mock;
  };
  mock.mockReturnValue = value => mock.mockImplementation(() => value);
  mock.mockReturnValueOnce = value =>
    mock.mockImplementationOnce(() => value);
  mock.mockResolvedValue = value =>
    mock.mockImplementation(() => Promise.resolve(value));
  mock.mockResolvedValueOnce = value =>
    mock.mockImplementationOnce(() => Promise.resolve(value));
  mock.mockRejectedValue = value =>
    mock.mockImplementation(() => Promise.reject(value));
  mock.mockRejectedValueOnce = value =>
    mock.mockImplementationOnce(() => Promise.reject(value));
  mock.mockReturnThis = () =>
    mock.mockImplementation(function returnThis() {
      return this;
    });
  mock.mockName = value => {
    name = String(value);
    return mock;
  };
  mock.getMockName = () => name;
  mock._setRestore = callback => {
    restore = callback;
    restoreRegistry.add(callback);
  };
  mockRegistry.add(new WeakRef(mock));
  return mock;
}

function newMockState() {
  return {
    calls: [],
    contexts: [],
    instances: [],
    invocationCallOrder: [],
    results: [],
    lastCall: undefined,
  };
}

function forEachRegisteredMock(callback) {
  for (const reference of mockRegistry) {
    const mock = reference.deref();
    if (mock) callback(mock);
    else mockRegistry.delete(reference);
  }
}

function findPropertyDescriptor(target, property) {
  let owner = target;
  while (owner && !Object.prototype.hasOwnProperty.call(owner, property)) {
    owner = Object.getPrototypeOf(owner);
  }
  return owner
    ? {owner, descriptor: Object.getOwnPropertyDescriptor(owner, property)}
    : undefined;
}

function spyOn(target, property, accessType) {
  if (
    (typeof target !== 'object' && typeof target !== 'function') ||
    target === null
  ) {
    throw new TypeError('Cannot use spyOn on a primitive value');
  }
  const found = findPropertyDescriptor(target, property);
  if (!found) throw new Error(`Property ${String(property)} does not exist`);
  const {descriptor} = found;
  const hadOwn = Object.prototype.hasOwnProperty.call(target, property);
  const ownDescriptor = Object.getOwnPropertyDescriptor(target, property);

  if (accessType !== undefined) {
    if (accessType !== 'get' && accessType !== 'set') {
      throw new Error("Property access type must be 'get' or 'set'");
    }
    const original = descriptor?.[accessType];
    if (typeof original !== 'function') {
      throw new Error(
        `Property ${String(property)} does not have access type ${accessType}`,
      );
    }
    if (isMock(original)) return original;
    const mock = createMock(function invokeOriginalAccessor(...args) {
      return original.apply(this, args);
    });
    Object.defineProperty(target, property, {
      ...descriptor,
      [accessType]: mock,
    });
    mock._setRestore(() => {
      if (hadOwn) Object.defineProperty(target, property, ownDescriptor);
      else delete target[property];
    });
    return mock;
  }

  const original =
    descriptor && 'value' in descriptor
      ? descriptor.value
      : descriptor?.get?.call(target);
  if (typeof original !== 'function') {
    throw new TypeError(`Property ${String(property)} is not a function`);
  }
  if (isMock(original)) return original;
  const mock = createMock(function invokeOriginal(...args) {
    return original.apply(this, args);
  });
  if ('value' in descriptor) target[property] = mock;
  else Object.defineProperty(target, property, {...descriptor, get: () => mock});
  mock._setRestore(() => {
    if (hadOwn) Object.defineProperty(target, property, ownDescriptor);
    else delete target[property];
  });
  return mock;
}

function replaceProperty(target, property, value) {
  if (
    target === null ||
    (typeof target !== 'object' && typeof target !== 'function')
  ) {
    const type = target === null ? 'null' : typeof target;
    throw new Error(
      `Cannot use replaceProperty on a primitive value; ${type} given`,
    );
  }
  if (property === null || property === undefined) {
    throw new Error('No property name supplied');
  }

  let descriptor = Object.getOwnPropertyDescriptor(target, property);
  let prototype = Object.getPrototypeOf(target);
  while (!descriptor && prototype !== null) {
    descriptor = Object.getOwnPropertyDescriptor(prototype, property);
    prototype = Object.getPrototypeOf(prototype);
  }
  if (!descriptor) {
    throw new Error(
      `Property \`${String(property)}\` does not exist in the provided object`,
    );
  }
  if (!descriptor.configurable) {
    throw new Error(
      `Property \`${String(property)}\` is not declared configurable`,
    );
  }
  if (descriptor.get !== undefined) {
    throw new Error(
      `Cannot replace the \`${String(property)}\` property because it has a getter. ` +
        `Use \`jest.spyOn(object, '${String(property)}', 'get').mockReturnValue(value)\` instead.`,
    );
  }
  if (descriptor.set !== undefined) {
    throw new Error(
      `Cannot replace the \`${String(property)}\` property because it has a setter. ` +
        `Use \`jest.spyOn(object, '${String(property)}', 'set').mockReturnValue(value)\` instead.`,
    );
  }
  if (typeof descriptor.value === 'function') {
    throw new TypeError(
      `Cannot replace the \`${String(property)}\` property because it is a function. ` +
        `Use \`jest.spyOn(object, '${String(property)}')\` instead.`,
    );
  }

  let replacements = replacedPropertyRegistry.get(target);
  const existing = replacements?.get(property);
  if (existing) return existing.replaceValue(value);

  const owned = Object.hasOwn(target, property);
  const originalValue = descriptor.value;
  let active = true;
  const restore = () => {
    if (!active) return;
    active = false;
    if (owned) target[property] = originalValue;
    else delete target[property];
    replacements.delete(property);
    if (replacements.size === 0) replacedPropertyRegistry.delete(target);
    restoreRegistry.delete(restore);
  };
  const replaced = {
    replaceValue(nextValue) {
      target[property] = nextValue;
      return replaced;
    },
    restore,
  };
  if (!replacements) {
    replacements = new Map();
    replacedPropertyRegistry.set(target, replacements);
  }
  replacements.set(property, replaced);
  restoreRegistry.add(restore);
  return replaced.replaceValue(value);
}

function requireFrom(path = activeModulePath) {
  return createRequire(path);
}

let configuredCommonJsResolver;
let configuredEsmResolver;
let customResolverSync;
let customResolverAsync;

function environmentExportConditions() {
  if (typeof customTestEnvironment?.exportConditions === 'function') {
    const exported = customTestEnvironment.exportConditions();
    if (Array.isArray(exported) && exported.every(value => typeof value === 'string')) {
      return exported;
    }
  }
  const configured = effectiveTestEnvironmentOptions?.customExportConditions;
  if (Array.isArray(configured) && configured.every(value => typeof value === 'string')) {
    return configured;
  }
  return isBuiltinJsdomEnvironment(effectiveTestEnvironment)
    ? ['browser']
    : ['node', 'node-addons'];
}

function resolverConditions(mode) {
  const environmentConditions = environmentExportConditions();
  return mode === 'import'
    ? [...new Set(['import', 'module-sync', 'default', ...environmentConditions])]
    : [...new Set(['require', 'module-sync', 'node', 'default', ...environmentConditions])];
}

function configuredResolver(mode) {
  const key = mode === 'import' ? 'esm' : 'commonjs';
  const existing = key === 'esm'
    ? configuredEsmResolver
    : configuredCommonJsResolver;
  if (existing) return existing;
  const resolver = new RuntimeResolverFactory({
    conditionNames: resolverConditions(mode),
    extensions: (request.moduleFileExtensions ?? []).map(extension =>
      extension.startsWith('.') ? extension : `.${extension}`,
    ),
    modules: configuredModuleDirectories,
    roots: [request.rootDir],
  });
  if (key === 'esm') configuredEsmResolver = resolver;
  else configuredCommonJsResolver = resolver;
  return resolver;
}

function runtimeDefaultResolver(specifier, options) {
  const moduleName = String(specifier);
  if (Module.isBuiltin(moduleName)) return moduleName;
  const {
    basedir,
    conditions,
    defaultAsyncResolver: _defaultAsyncResolver,
    defaultResolver: _defaultResolver,
    extensions,
    moduleDirectory,
    paths,
    rootDir,
    ...resolverOptions
  } = options;
  const resolveWithModules = modules => {
    const resolver = new RuntimeResolverFactory({
      ...resolverOptions,
      conditionNames: conditions,
      extensions,
      modules,
      roots: rootDir ? [rootDir] : undefined,
    });
    return resolver.sync(basedir, moduleName);
  };
  let result = resolveWithModules(moduleDirectory);
  if (!result.path && paths?.length) {
    const fallbackPaths = paths.filter(
      path => !(moduleDirectory ?? []).includes(path),
    );
    if (fallbackPaths.length > 0) result = resolveWithModules(fallbackPaths);
  }
  if (result.path) return result.path;
  throw moduleResolutionError(moduleName, join(basedir, 'resolver.js'), result.error);
}

async function runtimeDefaultAsyncResolver(specifier, options) {
  return runtimeDefaultResolver(specifier, options);
}

function customResolverOptions(fromPath, mode) {
  return {
    basedir: dirname(fromPath),
    conditions: resolverConditions(mode),
    defaultAsyncResolver: runtimeDefaultAsyncResolver,
    defaultResolver: runtimeDefaultResolver,
    extensions: (request.moduleFileExtensions ?? []).map(extension =>
      extension.startsWith('.') ? extension : `.${extension}`,
    ),
    moduleDirectory: configuredModuleDirectories,
    paths: request.modulePaths?.length ? request.modulePaths : undefined,
    rootDir: request.rootDir,
  };
}

async function configureCustomResolver() {
  if (!request.resolver) return;
  const sourceRequire = createRequire(request.testPath);
  const resolved = sourceRequire.resolve(request.resolver);
  let loaded;
  try {
    loaded = sourceRequire(resolved);
  } catch (error) {
    if (
      error?.code !== 'ERR_REQUIRE_ESM' &&
      error?.code !== 'ERR_REQUIRE_ASYNC_MODULE'
    ) {
      throw error;
    }
    loaded = await import(pathToFileURL(resolved).href);
  }
  const exported = loaded?.default ?? loaded;
  if (typeof exported === 'function') {
    customResolverSync = exported;
    customResolverAsync = exported;
    return;
  }
  if (exported && typeof exported === 'object') {
    customResolverSync =
      typeof exported.sync === 'function' ? exported.sync : undefined;
    customResolverAsync =
      typeof exported.async === 'function'
        ? exported.async
        : customResolverSync;
  }
  if (!customResolverSync && !customResolverAsync) {
    throw new TypeError(
      `Resolver located at ${resolved} does not export a function or an object with "sync" and "async" props`,
    );
  }
}

function isBareModuleSpecifier(specifier) {
  const moduleName = String(specifier);
  return (
    !Module.isBuiltin(moduleName) &&
    !moduleName.startsWith('.') &&
    !/^[A-Za-z][A-Za-z\d+.-]*:/.test(moduleName) &&
    !isAbsolute(moduleName)
  );
}

function customResolverCacheKey(specifier, fromPath, mode) {
  return `${mode}\0${normalizedRuntimePath(fromPath)}\0${String(specifier)}`;
}

function cachedAsyncCustomResolution(specifier, fromPath, mode) {
  return asyncCustomResolverCache.get(
    customResolverCacheKey(specifier, fromPath, mode),
  );
}

async function configuredModuleResolutionAsync(specifier, fromPath, mode) {
  if (transformerDepth > 0) return {handled: false};
  if (customResolverAsync) {
    const path = await customResolverAsync(
      String(specifier),
      customResolverOptions(fromPath, mode),
    );
    const resolution = {handled: true, path};
    asyncCustomResolverCache.set(
      customResolverCacheKey(specifier, fromPath, mode),
      resolution,
    );
    return resolution;
  }
  return configuredModuleResolution(specifier, fromPath, mode);
}

function configuredModuleResolution(specifier, fromPath, mode) {
  if (transformerDepth > 0) {
    return {handled: false};
  }
  if (mode === 'import' && customResolverAsync) {
    const cached = cachedAsyncCustomResolution(specifier, fromPath, mode);
    if (cached) return cached;
  }
  if (customResolverSync) {
    const path = customResolverSync(
      String(specifier),
      customResolverOptions(fromPath, mode),
    );
    if (path && typeof path.then === 'function') {
      throw new TypeError(
        `Custom resolver returned a promise while resolving ${String(specifier)} synchronously`,
      );
    }
    return {handled: true, path};
  }
  if (mode === 'import' && customResolverAsync) {
    return {
      error: `Async custom resolution for ${String(specifier)} was not prepared`,
      handled: true,
    };
  }
  if (!usesCustomModuleDirectories || !isBareModuleSpecifier(specifier)) {
    return {handled: false};
  }
  const result = configuredResolver(mode).sync(
    dirname(fromPath),
    String(specifier),
  );
  return {
    error: result.error,
    handled: true,
    path: result.path,
  };
}

function moduleResolutionError(specifier, fromPath, details) {
  const error = new Error(
    details || `Cannot find module '${String(specifier)}' from '${basename(fromPath)}'`,
  );
  error.code = 'MODULE_NOT_FOUND';
  return error;
}

function resolveCommonJsCandidate(specifier, parent, isMain, options) {
  const fromPath = parent?.filename ?? request.testPath;
  const configured = configuredModuleResolution(
    specifier,
    fromPath,
    'require',
  );
  if (!configured.handled) {
    return Reflect.apply(originalModuleResolveFilename, Module, [
      specifier,
      parent,
      isMain,
      options,
    ]);
  }
  if (configured.path) return configured.path;
  throw moduleResolutionError(specifier, fromPath, configured.error);
}

function mappedModuleCandidates(specifier) {
  const moduleName = String(specifier);
  for (const mapping of request.moduleNameMapper ?? []) {
    const expression = new RegExp(mapping.pattern);
    const matches = expression.exec(moduleName);
    if (!matches) continue;
    return mapping.replacements.map(replacement =>
      replacement.replaceAll(/\$(\d+)/g, (_, index) =>
        matches[Number.parseInt(index, 10)] ?? '',
      ),
    );
  }
  return undefined;
}

function esmParentPath(parentURL) {
  if (parentURL?.startsWith('file:')) return fileURLToPath(parentURL);
  if (typeof parentURL === 'string' && isAbsolute(parentURL)) return parentURL;
  return request.testPath;
}

function esmParentFileUrl(parentURL) {
  if (parentURL?.startsWith('file:')) return parentURL;
  return pathToFileURL(esmParentPath(parentURL)).href;
}

function esmUrlForResolvedPath(path) {
  if (Module.isBuiltin(path)) {
    return path.startsWith('node:') ? path : `node:${path}`;
  }
  if (/^[A-Za-z][A-Za-z\d+.-]*:/.test(path)) return path;
  return pathToFileURL(path).href;
}

function resolveEsmCandidate(specifier, parentURL) {
  const moduleName = String(specifier);
  if (Module.isBuiltin(moduleName)) {
    return moduleName.startsWith('node:') ? moduleName : `node:${moduleName}`;
  }
  esmResolutionDepth += 1;
  try {
    const parentPath = esmParentPath(parentURL);
    const configured = configuredModuleResolution(
      moduleName,
      parentPath,
      'import',
    );
    const resolved = configured.handled
      ? configured.path
      : createRequire(parentPath).resolve(moduleName);
    if (!resolved) return undefined;
    return esmUrlForResolvedPath(resolved);
  } catch {
    return undefined;
  } finally {
    esmResolutionDepth -= 1;
  }
}

function mappedEsmResolution(specifier, parentURL) {
  const candidates = mappedModuleCandidates(specifier);
  if (!candidates) return undefined;
  for (const candidate of candidates) {
    const resolved = resolveEsmCandidate(candidate, parentURL);
    if (resolved) return resolved;
  }
  return undefined;
}

function esmMockCoordinates(specifier, parentURL) {
  const moduleName = String(specifier);
  const relative = moduleName.startsWith('.') || isAbsolute(moduleName);
  const canonical =
    mappedEsmResolution(moduleName, parentURL) ??
    resolveEsmCandidate(moduleName, parentURL);
  const fallback = isAbsolute(moduleName)
    ? pathToFileURL(moduleName).href
    : relative
      ? new URL(moduleName, esmParentFileUrl(parentURL)).href
      : moduleName;
  const identity = relative ? canonical ?? fallback : moduleName;
  const decisionIdentity = canonical ?? fallback;
  return {
    cacheKey: relative ? `path:${identity}` : `name:${identity}`,
    canonical,
    decisionKey: `module:${decisionIdentity}`,
    identity,
    moduleName,
    relative,
  };
}

function registeredEsmMock(specifier, parentURL) {
  if (esmAutomockBypassDepth > 0) return undefined;
  const coordinates = esmMockCoordinates(specifier, parentURL);
  const explicit = esmModuleMocks.find(entry =>
    entry.automatic
      ? false
      : coordinates.relative
        ? entry.relative && entry.identity === coordinates.identity
        : !entry.relative && entry.specifier === coordinates.moduleName,
  );
  if (explicit) return explicit;
  if (
    !automockEnabled ||
    explicitlyUnmockedEsmModules.has(coordinates.decisionKey)
  ) {
    return undefined;
  }
  return esmModuleMocks.find(
    entry =>
      entry.automatic && entry.decisionKey === coordinates.decisionKey,
  );
}

function esmAutomockDecision(specifier, parentURL) {
  const moduleName = String(specifier);
  if (
    !automockEnabled ||
    esmAutomockBypassDepth > 0 ||
    transformerDepth > 0 ||
    moduleName === '@jest/globals' ||
    Module.isBuiltin(moduleName)
  ) {
    return undefined;
  }
  const coordinates = esmMockCoordinates(moduleName, parentURL);
  if (
    coordinates.canonical?.startsWith('node:') ||
    explicitlyUnmockedEsmModules.has(coordinates.decisionKey)
  ) {
    return undefined;
  }
  if (coordinates.canonical?.startsWith('file:')) {
    const normalized = normalizedRuntimePath(
      fileURLToPath(coordinates.canonical),
    );
    if (normalized === normalizedRuntimePath(request.testPath)) return undefined;
    if (
      [...(request.setupFiles ?? []), ...(request.setupFilesAfterEnv ?? [])].some(
        setupPath => normalized === normalizedRuntimePath(setupPath),
      )
    ) {
      return undefined;
    }
  }
  return coordinates;
}

function esmDataUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
}

function cacheEsmMock(entry, value) {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
    throw new TypeError(
      `jest.unstable_mockModule factory for ${entry.specifier} must return an object`,
    );
  }
  entry.generation += 1;
  entry.valueKey = `${entry.id}:${nextEsmMockValueId++}`;
  entry.value = value;
  entry.initialized = true;
  esmMockValues.set(entry.valueKey, value);
  entry.url = esmDataUrl(esmMockSource(entry));
  esmModuleMockCache.set(entry.cacheKey, entry);
  return entry.url;
}

function cachedEsmMock(cacheKey) {
  return (
    esmModuleMockCache.get(cacheKey) ??
    inheritedEsmModuleMockCache?.get(cacheKey)
  );
}

function adoptCachedEsmMock(entry) {
  const cached = cachedEsmMock(entry.cacheKey);
  if (!cached?.initialized) return false;
  entry.generation = cached.generation;
  entry.initialized = true;
  entry.url = cached.url;
  entry.value = cached.value;
  entry.valueKey = cached.valueKey;
  return true;
}

function initializeEsmMock(entry) {
  if (entry.initialized) return entry.url;
  if (adoptCachedEsmMock(entry)) return entry.url;
  const value = entry.factory();
  if (value && typeof value.then === 'function') {
    throw new Error(
      `Async jest.unstable_mockModule factories require a dynamic import for ${entry.specifier}`,
    );
  }
  return cacheEsmMock(entry, value);
}

async function initializeEsmMockAsync(entry) {
  if (entry.initialized) return entry.url;
  if (adoptCachedEsmMock(entry)) return entry.url;
  return cacheEsmMock(entry, await entry.factory());
}

function esmMockSource(entry) {
  const value = esmMockValues.get(entry.valueKey);
  const lines = [
    `const value = globalThis[Symbol.for('rjest.esmRuntime')].mockValues.get(${JSON.stringify(entry.valueKey)});`,
  ];
  if (Object.prototype.hasOwnProperty.call(value, 'default')) {
    lines.push('export default value.default;');
  }
  let exportIndex = 0;
  for (const name of Object.keys(value).filter(name => name !== 'default')) {
    const binding = `__rjestExport${exportIndex++}`;
    lines.push(`const ${binding} = value[${JSON.stringify(name)}];`);
    lines.push(`export {${binding} as ${JSON.stringify(name)}};`);
  }
  return lines.join('\n');
}

const dynamicImportBridgeParameter = '__rjest_dynamic_import_bridge__';

// Node's in-process customization hook is synchronous, but an ESM mock's export
// names are not known until an async factory settles. File-backed ESM sources
// therefore route dynamic import() through the worker. Non-mocked imports are
// delegated to a virtual module at the original parent URL so Node still owns
// relative/package resolution, conditional exports, and import attributes.

function dynamicImportBridgeUrl(parentURL) {
  const url = new URL(parentURL);
  url.searchParams.set(dynamicImportBridgeParameter, '1');
  return url.href;
}

function isDynamicImportBridgeUrl(url) {
  if (!url.startsWith('file:')) return false;
  return new URL(url).searchParams.get(dynamicImportBridgeParameter) === '1';
}

function dynamicImportBridgeSource() {
  return [
    'export function importFromParent(specifier, options) {',
    '  return options === undefined ? import(specifier) : import(specifier, options);',
    '}',
    'export function resolveFromParent(specifier) {',
    '  return import.meta.resolve(specifier);',
    '}',
  ].join('\n');
}

async function dynamicImportBridge(parentURL) {
  let bridge = dynamicImportBridges.get(parentURL);
  if (!bridge) {
    bridge = import(dynamicImportBridgeUrl(parentURL));
    dynamicImportBridges.set(parentURL, bridge);
  }
  return bridge;
}

async function nativeDynamicImport(parentURL, specifier, options) {
  const bridge = await dynamicImportBridge(parentURL);
  return bridge.importFromParent(specifier, options);
}

async function importEsmModule(parentURL, specifier, options) {
  let mock = registeredEsmMock(specifier, parentURL);
  if (mock) return import(await initializeEsmMockAsync(mock));
  const automock = esmAutomockDecision(specifier, parentURL);
  if (automock) {
    mock = await ensureEsmAutoMock(specifier, parentURL, automock);
    if (mock) return import(mock.url);
  }
  await prepareReachableEsmGraph(parentURL, specifier);
  return nativeDynamicImport(parentURL, specifier, options);
}

function rewriteDynamicImports(source, staticSpecifiers) {
  const replacements = [];
  const regexPrefixKeywords = new Set([
    'await',
    'case',
    'delete',
    'do',
    'else',
    'in',
    'instanceof',
    'new',
    'of',
    'return',
    'throw',
    'typeof',
    'void',
    'yield',
  ]);

  function skipQuoted(index, quote) {
    index += 1;
    while (index < source.length) {
      if (source[index] === '\\') index += 2;
      else if (source[index] === quote) return index + 1;
      else index += 1;
    }
    return index;
  }

  function skipLineComment(index) {
    const newline = source.indexOf('\n', index + 2);
    return newline === -1 ? source.length : newline;
  }

  function skipBlockComment(index) {
    const end = source.indexOf('*/', index + 2);
    return end === -1 ? source.length : end + 2;
  }

  function skipRegex(index) {
    let characterClass = false;
    index += 1;
    while (index < source.length) {
      const character = source[index];
      if (character === '\\') {
        index += 2;
        continue;
      }
      if (character === '[') characterClass = true;
      else if (character === ']') characterClass = false;
      else if (character === '/' && !characterClass) {
        index += 1;
        while (/[A-Za-z]/.test(source[index] ?? '')) index += 1;
        return index;
      } else if (character === '\n' || character === '\r') {
        return index;
      }
      index += 1;
    }
    return index;
  }

  function skipTrivia(index) {
    while (index < source.length) {
      if (/\s/.test(source[index])) {
        index += 1;
      } else if (source.startsWith('//', index)) {
        index = skipLineComment(index);
      } else if (source.startsWith('/*', index)) {
        index = skipBlockComment(index);
      } else {
        break;
      }
    }
    return index;
  }

  function stringLiteralAt(index) {
    const quote = source[index];
    if (quote !== "'" && quote !== '"') return undefined;
    const end = skipQuoted(index, quote);
    if (source[end - 1] !== quote) return undefined;
    try {
      const value = NativeFunction(
        `"use strict"; return (${source.slice(index, end)});`,
      )();
      return typeof value === 'string' ? {end, value} : undefined;
    } catch {
      return undefined;
    }
  }

  function staticSpecifierAfter(index, allowSideEffectImport) {
    let cursor = skipTrivia(index);
    if (allowSideEffectImport) {
      const sideEffect = stringLiteralAt(cursor);
      if (sideEffect) return sideEffect.value;
    }
    while (cursor < source.length) {
      cursor = skipTrivia(cursor);
      const character = source[cursor];
      if (character === ';' || character === '`') return undefined;
      if (character === "'" || character === '"') {
        cursor = skipQuoted(cursor, character);
        continue;
      }
      if (/[A-Za-z_$]/.test(character ?? '')) {
        let end = cursor + 1;
        while (/[\w$]/.test(source[end] ?? '')) end += 1;
        const word = source.slice(cursor, end);
        if (word === 'from') {
          const specifier = stringLiteralAt(skipTrivia(end));
          if (specifier) return specifier.value;
        }
        if (
          !allowSideEffectImport &&
          ['class', 'const', 'default', 'function', 'let', 'var'].includes(word)
        ) {
          return undefined;
        }
        cursor = end;
        continue;
      }
      cursor += 1;
    }
    return undefined;
  }

  function scanTemplate(index) {
    index += 1;
    while (index < source.length) {
      if (source[index] === '\\') {
        index += 2;
      } else if (source[index] === '`') {
        return index + 1;
      } else if (source[index] === '$' && source[index + 1] === '{') {
        index = scanCode(index + 2, true);
      } else {
        index += 1;
      }
    }
    return index;
  }

  function scanCode(start, stopAtTemplateExpression) {
    let index = start;
    let braceDepth = 0;
    let canStartRegex = true;
    const controlParentheses = [];
    let pendingControlParenthesis = false;

    while (index < source.length) {
      const character = source[index];
      if (/\s/.test(character)) {
        index += 1;
        continue;
      }
      if (source.startsWith('//', index)) {
        index = skipLineComment(index);
        continue;
      }
      if (source.startsWith('/*', index)) {
        index = skipBlockComment(index);
        continue;
      }
      if (character === "'" || character === '"') {
        index = skipQuoted(index, character);
        canStartRegex = false;
        pendingControlParenthesis = false;
        continue;
      }
      if (character === '`') {
        index = scanTemplate(index);
        canStartRegex = false;
        pendingControlParenthesis = false;
        continue;
      }
      if (character === '/') {
        if (canStartRegex) {
          index = skipRegex(index);
          canStartRegex = false;
        } else {
          index += 1;
          canStartRegex = true;
        }
        pendingControlParenthesis = false;
        continue;
      }
      if (/[A-Za-z_$]/.test(character)) {
        let end = index + 1;
        while (/[\w$]/.test(source[end] ?? '')) end += 1;
        const word = source.slice(index, end);
        if (word === 'import') {
          const opening = skipTrivia(end);
          if (source[opening] === '(') {
            const preservedLines = source
              .slice(end, opening + 1)
              .replace(/[^\n]/g, '');
            replacements.push({
              end: opening + 1,
              start: index,
              text:
                "globalThis[Symbol.for('rjest.esmRuntime')].importModule(import.meta.url," +
                preservedLines,
            });
            index = opening + 1;
            canStartRegex = true;
            pendingControlParenthesis = false;
            continue;
          }
          if (staticSpecifiers) {
            const specifier = staticSpecifierAfter(end, true);
            if (specifier !== undefined) staticSpecifiers.push(specifier);
          }
        } else if (word === 'export' && staticSpecifiers) {
          const opening = source[skipTrivia(end)];
          if (opening === '*' || opening === '{') {
            const specifier = staticSpecifierAfter(end, false);
            if (specifier !== undefined) staticSpecifiers.push(specifier);
          }
        }
        pendingControlParenthesis = ['catch', 'for', 'if', 'switch', 'while', 'with'].includes(
          word,
        );
        canStartRegex = regexPrefixKeywords.has(word);
        index = end;
        continue;
      }
      if (/[0-9]/.test(character)) {
        index += 1;
        while (/[\w.]/.test(source[index] ?? '')) index += 1;
        canStartRegex = false;
        pendingControlParenthesis = false;
        continue;
      }
      if (character === '(') {
        controlParentheses.push(pendingControlParenthesis);
        pendingControlParenthesis = false;
        canStartRegex = true;
      } else if (character === ')') {
        canStartRegex = controlParentheses.pop() === true;
        pendingControlParenthesis = false;
      } else if (character === '{') {
        braceDepth += 1;
        canStartRegex = true;
        pendingControlParenthesis = false;
      } else if (character === '}') {
        if (stopAtTemplateExpression && braceDepth === 0) return index + 1;
        braceDepth = Math.max(0, braceDepth - 1);
        canStartRegex = false;
        pendingControlParenthesis = false;
      } else if (character === ']' || character === '.') {
        canStartRegex = false;
        pendingControlParenthesis = false;
      } else {
        canStartRegex = true;
        pendingControlParenthesis = false;
      }
      index += 1;
    }
    return index;
  }

  scanCode(0, false);
  if (replacements.length === 0) return source;
  let rewritten = source;
  for (const replacement of replacements.reverse()) {
    rewritten =
      rewritten.slice(0, replacement.start) +
      replacement.text +
      rewritten.slice(replacement.end);
  }
  return rewritten;
}

function rewriteLoadedEsmSource(loaded) {
  if (loaded.format !== 'module' || loaded.source == null) return loaded;
  const source =
    typeof loaded.source === 'string'
      ? loaded.source
      : Buffer.from(loaded.source).toString('utf8');
  const rewritten = rewriteDynamicImports(source);
  return rewritten === source ? loaded : {...loaded, source: rewritten};
}

async function staticEsmSpecifiers(url) {
  if (!url.startsWith('file:') || isDynamicImportBridgeUrl(url)) return [];
  const filename = fileURLToPath(url);
  const cached = esmStaticDependencyCache.get(filename);
  if (cached) return cached;
  let source;
  try {
    source = readFileSync(filename, 'utf8');
  } catch {
    return [];
  }
  const selected = runtimeTransformerFor(filename);
  if (selected && isEsmRuntimePath(filename)) {
    source = (await transformRuntimeSourceAsync(
      selected,
      source,
      filename,
      shouldInstrument(filename),
      true,
    )).code;
  }
  const specifiers = [];
  rewriteDynamicImports(source, specifiers);
  esmStaticDependencyCache.set(filename, specifiers);
  return specifiers;
}

async function resolveFromEsmParent(parentURL, specifier) {
  if (specifier === '@jest/globals') return esmDataUrl(jestGlobalsSource());
  if (customResolverAsync) {
    const fromPath = esmParentPath(parentURL);
    const candidates = mappedModuleCandidates(specifier) ?? [specifier];
    let lastResolution;
    for (const candidate of candidates) {
      const resolution = await configuredModuleResolutionAsync(
        candidate,
        fromPath,
        'import',
      );
      lastResolution = resolution;
      if (!resolution.path) continue;
      asyncCustomResolverCache.set(
        customResolverCacheKey(specifier, fromPath, 'import'),
        resolution,
      );
      return esmUrlForResolvedPath(resolution.path);
    }
    if (lastResolution?.handled) {
      throw moduleResolutionError(
        specifier,
        fromPath,
        lastResolution.error,
      );
    }
  }
  const bridge = await dynamicImportBridge(parentURL);
  return bridge.resolveFromParent(specifier);
}

async function prepareEsmGraph(root) {
  const queue = [root];
  const visited = new Set();
  for (let index = 0; index < queue.length; index += 1) {
    const url = queue[index];
    if (visited.has(url)) continue;
    visited.add(url);
    for (const dependency of await staticEsmSpecifiers(url)) {
      let mock = registeredEsmMock(dependency, url);
      const automock = mock ? undefined : esmAutomockDecision(dependency, url);
      if (automock) {
        mock = await ensureEsmAutoMock(dependency, url, automock);
      }
      if (mock) {
        await initializeEsmMockAsync(mock);
      } else {
        const resolved = await resolveFromEsmParent(url, dependency);
        if (resolved.startsWith('file:')) queue.push(resolved);
      }
    }
  }
}

async function prepareReachableEsmGraph(parentURL, specifier) {
  const root = await resolveFromEsmParent(parentURL, specifier);
  await prepareEsmGraph(root);
}

function jestGlobalsSource() {
  const names = [
    'afterAll',
    'afterEach',
    'beforeAll',
    'beforeEach',
    'describe',
    'expect',
    'fit',
    'it',
    'jest',
    'test',
    'xdescribe',
    'xit',
    'xtest',
  ];
  return [
    `const api = globalThis[Symbol.for('rjest.esmRuntime')].globals;`,
    ...names.map(name => `export const ${name} = api.${name};`),
  ].join('\n');
}

function isEsmRuntimePath(filename) {
  const normalized = normalizedRuntimePath(filename);
  return (
    /\.(?:mjs|mts)$/.test(normalized) ||
    (request.extensionsToTreatAsEsm ?? []).some(extension =>
      normalized.endsWith(extension),
    )
  );
}

const esmGenerationParameter = '__rjest_esm_generation__';

function versionedEsmUrl(url) {
  if (esmModuleGeneration === 0 || !url.startsWith('file:')) return url;
  const versioned = new URL(url);
  versioned.searchParams.set(esmGenerationParameter, String(esmModuleGeneration));
  return versioned.href;
}

function versionedEsmResolution(resolution) {
  if (!resolution?.url) return resolution;
  const url = versionedEsmUrl(resolution.url);
  return url === resolution.url ? resolution : {...resolution, url};
}

function freshEsmModuleGeneration() {
  return nextEsmModuleGeneration++;
}

function clearEsmMockEntry(entry) {
  entry.initialized = false;
  entry.url = undefined;
  entry.value = undefined;
  entry.valueKey = undefined;
}

function clearCommonJsModuleCache(cache = Module._cache) {
  for (const path of Object.keys(cache)) {
    if (!path.includes('/node_modules/')) delete cache[path];
  }
}

function resetCommonJsMockEntries() {
  for (const registry of [moduleMocks, virtualModuleMocks]) {
    for (const entry of registry.values()) {
      entry.initialized = false;
      entry.value = undefined;
    }
  }
}

function resetEsmModules() {
  esmModuleGeneration = freshEsmModuleGeneration();
  esmModuleMockCache.clear();
  inheritedEsmModuleMockCache = undefined;
  esmMockValues.clear();
  for (const entry of esmModuleMocks) {
    clearEsmMockEntry(entry);
  }
}

function snapshotMockEntry(entry) {
  return {
    generation: entry.generation,
    initialized: entry.initialized,
    url: entry.url,
    value: entry.value,
    valueKey: entry.valueKey,
  };
}

function restoreMockEntry(entry, snapshot) {
  entry.generation = snapshot.generation;
  entry.initialized = snapshot.initialized;
  entry.url = snapshot.url;
  entry.value = snapshot.value;
  entry.valueKey = snapshot.valueKey;
}

function snapshotCommonJsMockEntries() {
  return new Map(
    [moduleMocks, virtualModuleMocks].flatMap(registry =>
      [...registry.values()].map(entry => [
        entry,
        {initialized: entry.initialized, value: entry.value},
      ]),
    ),
  );
}

function restoreCommonJsMockEntries(snapshots) {
  for (const registry of [moduleMocks, virtualModuleMocks]) {
    for (const entry of registry.values()) {
      const snapshot = snapshots.get(entry);
      entry.initialized = snapshot?.initialized ?? false;
      entry.value = snapshot?.value;
    }
  }
}

function beginEsmManualMockScratch() {
  const state = {
    commonJsCache: Module._cache,
    commonJsMocks: snapshotCommonJsMockEntries(),
    esmGeneration: esmModuleGeneration,
    esmMockCache: esmModuleMockCache,
    esmMockEntries: new Map(
      esmModuleMocks.map(entry => [entry, snapshotMockEntry(entry)]),
    ),
    esmMockValueKeys: new Set(esmMockValues.keys()),
    inheritedEsmMockCache: inheritedEsmModuleMockCache,
  };
  Module._cache = Object.create(null);
  esmModuleGeneration = freshEsmModuleGeneration();
  inheritedEsmModuleMockCache = undefined;
  esmModuleMockCache = new Map();
  return state;
}

function endEsmManualMockScratch(state) {
  Module._cache = state.commonJsCache;
  restoreCommonJsMockEntries(state.commonJsMocks);
  esmModuleGeneration = state.esmGeneration;
  esmModuleMockCache = state.esmMockCache;
  inheritedEsmModuleMockCache = state.inheritedEsmMockCache;
  for (const entry of esmModuleMocks) {
    const snapshot = state.esmMockEntries.get(entry);
    if (snapshot) restoreMockEntry(entry, snapshot);
    else clearEsmMockEntry(entry);
  }
  for (const key of esmMockValues.keys()) {
    if (!state.esmMockValueKeys.has(key)) esmMockValues.delete(key);
  }
}

function beginModuleIsolation() {
  const state = {
    active: true,
    commonJsCache: Module._cache,
    commonJsMocks: snapshotCommonJsMockEntries(),
    esmGeneration: esmModuleGeneration,
    esmMockCache: esmModuleMockCache,
    esmMockEntries: new Map(
      esmModuleMocks.map(entry => [entry, snapshotMockEntry(entry)]),
    ),
    inheritedEsmMockCache: inheritedEsmModuleMockCache,
  };
  Module._cache = Object.create(null);
  esmModuleGeneration = freshEsmModuleGeneration();
  inheritedEsmModuleMockCache = esmModuleMockCache;
  esmModuleMockCache = new Map();
  return state;
}

function endModuleIsolation(state) {
  if (!state.active) return;
  Module._cache = state.commonJsCache;
  restoreCommonJsMockEntries(state.commonJsMocks);
  esmModuleGeneration = state.esmGeneration;
  esmModuleMockCache = state.esmMockCache;
  inheritedEsmModuleMockCache = state.inheritedEsmMockCache;
  for (const entry of esmModuleMocks) {
    const snapshot = state.esmMockEntries.get(entry);
    if (snapshot) restoreMockEntry(entry, snapshot);
    else clearEsmMockEntry(entry);
  }
  state.active = false;
}

function resetModuleIsolation(state) {
  clearCommonJsModuleCache(Module._cache);
  clearCommonJsModuleCache(state.commonJsCache);
  Module._cache = state.commonJsCache;
  resetCommonJsMockEntries();

  esmModuleMockCache.clear();
  state.esmMockCache.clear();
  esmModuleMockCache = state.esmMockCache;
  inheritedEsmModuleMockCache = undefined;
  esmMockValues.clear();
  esmModuleGeneration = freshEsmModuleGeneration();
  for (const entry of esmModuleMocks) clearEsmMockEntry(entry);

  state.commonJsMocks.clear();
  state.esmMockEntries.clear();
  state.active = false;
}

function configureEsmRuntime() {
  if (esmHooksInstalled || !isEsmRuntimePath(request.testPath)) return;
  globalThis[Symbol.for('rjest.esmRuntime')] = {
    globals: {
      afterAll,
      afterEach,
      beforeAll,
      beforeEach,
      describe,
      expect,
      fit: test.only,
      it,
      jest,
      test,
      xdescribe: describe.skip,
      xit: test.skip,
      xtest: test.skip,
    },
    importModule: importEsmModule,
    mockValues: esmMockValues,
  };
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (transformerDepth > 0 || esmResolutionDepth > 0) {
        return nextResolve(specifier, context);
      }
      if (request.resolver && String(specifier).startsWith('file:')) {
        return nextResolve(specifier, context);
      }
      if (!context.parentURL && request.resolver) {
        return nextResolve(specifier, context);
      }
      if (specifier === '@jest/globals') {
        return {shortCircuit: true, url: esmDataUrl(jestGlobalsSource())};
      }
      const mock = registeredEsmMock(specifier, context.parentURL);
      if (mock) {
        return {shortCircuit: true, url: initializeEsmMock(mock)};
      }
      const mapped = mappedEsmResolution(specifier, context.parentURL);
      if (mapped) {
        return {shortCircuit: true, url: versionedEsmUrl(mapped)};
      }
      const configured = configuredModuleResolution(
        specifier,
        esmParentPath(context.parentURL),
        'import',
      );
      if (configured.handled) {
        if (!configured.path) {
          throw moduleResolutionError(
            specifier,
            esmParentPath(context.parentURL),
            configured.error,
          );
        }
        const url = esmUrlForResolvedPath(configured.path);
        return {
          shortCircuit: true,
          url: versionedEsmUrl(url),
        };
      }
      try {
        return versionedEsmResolution(nextResolve(specifier, context));
      } catch (error) {
        const moduleName = String(specifier);
        if (moduleName.startsWith('.') || isAbsolute(moduleName)) {
          const resolved = resolveEsmCandidate(moduleName, context.parentURL);
          if (resolved) {
            return {
              shortCircuit: true,
              url: versionedEsmUrl(resolved),
            };
          }
        }
        throw error;
      }
    },
    load(url, context, nextLoad) {
      if (isDynamicImportBridgeUrl(url)) {
        return {
          format: 'module',
          shortCircuit: true,
          source: dynamicImportBridgeSource(),
        };
      }
      if (url.startsWith('file:')) {
        const filename = fileURLToPath(url);
        const selected = runtimeTransformerFor(filename);
        if (selected && isEsmRuntimePath(filename)) {
          const source = readFileSync(filename, 'utf8');
          const transformed = transformRuntimeSource(
            selected,
            source,
            filename,
            shouldInstrument(filename),
            true,
          );
          return {
            format: 'module',
            shortCircuit: true,
            source: rewriteDynamicImports(transformed.code),
          };
        }
      }
      if (url.startsWith('file:')) {
        return rewriteLoadedEsmSource(nextLoad(url, context));
      }
      return nextLoad(url, context);
    },
  });
  esmHooksInstalled = true;
}

Module._resolveFilename = function rjestResolveFilename(
  specifier,
  parent,
  isMain,
  options,
) {
  if (transformerDepth > 0) {
    return Reflect.apply(originalModuleResolveFilename, this, [
      specifier,
      parent,
      isMain,
      options,
    ]);
  }
  const candidates = mappedModuleCandidates(specifier);
  if (!candidates) {
    try {
      return resolveCommonJsCandidate(specifier, parent, isMain, options);
    } catch (error) {
      const manualPath = unresolvedManualMockPath(
        specifier,
        parent?.filename ?? request.testPath,
      );
      if (manualPath) return manualPath;
      throw error;
    }
  }
  let lastError;
  for (const candidate of candidates) {
    try {
      return resolveCommonJsCandidate(candidate, parent, isMain, options);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
};

function unresolvedManualMockPath(specifier, fromPath) {
  const moduleName = String(specifier);
  if (
    Module.isBuiltin(moduleName) ||
    moduleName.startsWith('.') ||
    moduleName.startsWith('/')
  ) {
    return undefined;
  }
  let directory = dirname(fromPath);
  const root = resolvePath(request.rootDir);
  while (directory === root || directory.startsWith(`${root}/`)) {
    const base = join(directory, '__mocks__', moduleName);
    const candidates = [base];
    for (const extension of request.moduleFileExtensions ?? []) {
      candidates.push(`${base}.${extension}`, join(base, `index.${extension}`));
    }
    const match = candidates.find(candidate => existsSync(candidate));
    if (match) return match;
    if (directory === root) break;
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return undefined;
}

function resolveModuleKey(specifier, fromPath = activeModulePath) {
  return requireFrom(fromPath).resolve(String(specifier));
}

function shouldTransitivelyUnmockModule(key, parentPath) {
  const normalizedKey = normalizedRuntimePath(key);
  const normalizedParent = parentPath
    ? normalizedRuntimePath(parentPath)
    : undefined;
  if (
    normalizedParent &&
    (deeplyUnmockedModules.has(normalizedParent) ||
      transitivelyUnmockedModules.has(normalizedParent))
  ) {
    transitivelyUnmockedModules.add(normalizedKey);
    return true;
  }
  return false;
}

function shouldAutomockModule(specifier, key, parentPath) {
  if (transformerDepth > 0) return false;
  if (!automockEnabled || bypassModuleMocks.has(key)) return false;
  if (explicitlyUnmockedModules.has(key)) return false;
  if (Module.isBuiltin(String(specifier))) return false;
  const normalizedKey = normalizedRuntimePath(key);
  if (shouldTransitivelyUnmockModule(key, parentPath)) return false;
  if (normalizedKey === normalizedRuntimePath(request.testPath)) return false;
  if (
    [...(request.setupFiles ?? []), ...(request.setupFilesAfterEnv ?? [])].some(
      setupPath => normalizedKey === normalizedRuntimePath(setupPath),
    )
  ) {
    return false;
  }
  return true;
}

function loadActualModule(specifier, fromPath = activeModulePath) {
  const key = resolveModuleKey(specifier, fromPath);
  bypassModuleMocks.add(key);
  try {
    return requireFrom(fromPath)(specifier);
  } finally {
    bypassModuleMocks.delete(key);
  }
}

function notifyGeneratedMock(modulePath, moduleMock) {
  let result = moduleMock;
  for (const callback of onGenerateMockCallbacks) {
    result = callback(modulePath, result);
  }
  return result;
}

function generateAutoMock(specifier, fromPath = activeModulePath) {
  const modulePath = resolveModuleKey(specifier, fromPath);
  const previousCache = Module._cache;
  const registrySnapshots = [moduleMocks, virtualModuleMocks].map(registry => [
    registry,
    [...registry.entries()].map(([key, entry]) => [
      key,
      entry,
      entry.initialized,
      entry.value,
    ]),
  ]);
  Module._cache = Object.create(null);
  for (const [registry] of registrySnapshots) {
    for (const entry of registry.values()) {
      entry.initialized = false;
      entry.value = undefined;
    }
  }
  try {
    return notifyGeneratedMock(
      modulePath,
      createAutoMock(loadActualModule(specifier, fromPath)),
    );
  } finally {
    Module._cache = previousCache;
    for (const [registry, entries] of registrySnapshots) {
      registry.clear();
      for (const [key, entry, initialized, value] of entries) {
        entry.initialized = initialized;
        entry.value = value;
        registry.set(key, entry);
      }
    }
  }
}

function createAutoMock(value, seen = new WeakMap()) {
  if (isMock(value)) return value;
  if (typeof value === 'function') {
    if (seen.has(value)) return seen.get(value);
    const mock = createMock();
    seen.set(value, mock);
    try {
      Object.defineProperty(mock, 'name', {
        configurable: true,
        value: value.name,
      });
    } catch {
      // Some host functions protect their display name.
    }
    for (const key of Reflect.ownKeys(value)) {
      if (
        key === 'length' ||
        key === 'name' ||
        key === 'prototype' ||
        key === 'caller' ||
        key === 'arguments'
      ) {
        continue;
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor)) continue;
      Object.defineProperty(mock, key, {
        configurable: true,
        enumerable: descriptor.enumerable,
        value: createAutoMock(descriptor.value, seen),
        writable: true,
      });
    }
    if (value.prototype && typeof value.prototype === 'object') {
      seen.set(value.prototype, mock.prototype);
      for (const key of Reflect.ownKeys(value.prototype)) {
        if (key === 'constructor') continue;
        const descriptor = Object.getOwnPropertyDescriptor(value.prototype, key);
        if (!descriptor || !('value' in descriptor)) continue;
        Object.defineProperty(mock.prototype, key, {
          ...descriptor,
          value: createAutoMock(descriptor.value, seen),
        });
      }
    }
    return mock;
  }
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);
  if (Array.isArray(value)) {
    const result = [];
    seen.set(value, result);
    return result;
  }
  const result = {};
  seen.set(value, result);
  for (
    let source = value;
    source && source !== Object.prototype;
    source = Object.getPrototypeOf(source)
  ) {
    for (const key of Reflect.ownKeys(source)) {
      if (key === 'constructor' || Object.hasOwn(result, key)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(source, key);
      if (!descriptor) continue;
      if ('value' in descriptor) {
        result[key] = createAutoMock(descriptor.value, seen);
      } else if (
        source === value &&
        descriptor.enumerable &&
        typeof descriptor.get === 'function'
      ) {
        result[key] = createAutoMock(descriptor.get.call(value), seen);
      }
    }
  }
  return result;
}

async function loadEsmAutomockMetadata(specifier, parentURL) {
  // Metadata discovery must not populate the live native registry or recursively
  // automock the target's graph. A temporary URL generation gives Node a
  // scratch graph while the bypass keeps explicit/generated ESM mocks out.
  const previousGeneration = esmModuleGeneration;
  esmAutomockBypassDepth += 1;
  esmModuleGeneration = freshEsmModuleGeneration();
  try {
    await prepareReachableEsmGraph(parentURL, specifier);
    return await nativeDynamicImport(parentURL, specifier);
  } finally {
    esmModuleGeneration = previousGeneration;
    esmAutomockBypassDepth -= 1;
  }
}

function esmManualMockPath(specifier, parentURL, coordinates) {
  const rootMock = unresolvedManualMockPath(
    specifier,
    esmParentPath(parentURL),
  );
  if (rootMock) return rootMock;
  if (!coordinates.canonical?.startsWith('file:')) return undefined;
  const targetPath = fileURLToPath(coordinates.canonical);
  const sibling = join(dirname(targetPath), '__mocks__', basename(targetPath));
  return existsSync(sibling) ? sibling : undefined;
}

function esmGeneratedMockModulePath(coordinates) {
  return coordinates.canonical?.startsWith('file:')
    ? fileURLToPath(coordinates.canonical)
    : coordinates.canonical ?? coordinates.identity;
}

async function loadEsmManualMock(manualPath) {
  // The authored manual module executes in scratch registries so its native
  // namespace and generated dependencies do not populate the live caches.
  // Mock decisions still apply to its imports, matching Jest's manual-mock
  // loader rather than the mock-free metadata discovery path above.
  const scratch = beginEsmManualMockScratch();
  try {
    const root = pathToFileURL(manualPath).href;
    await prepareEsmGraph(root);
    return await nativeDynamicImport(root, root);
  } finally {
    endEsmManualMockScratch(scratch);
  }
}

async function ensureEsmAutoMock(specifier, parentURL, coordinates) {
  const existing = esmModuleMocks.find(
    entry => entry.automatic && entry.decisionKey === coordinates.decisionKey,
  );
  if (existing) return existing;
  const inFlight = pendingEsmAutoMocks.get(coordinates.decisionKey);
  if (inFlight) return inFlight;
  const pending = (async () => {
    const manualPath = esmManualMockPath(specifier, parentURL, coordinates);
    const generatedModulePath = esmGeneratedMockModulePath(coordinates);
    const actual = manualPath
      ? await loadEsmManualMock(manualPath)
      : await loadEsmAutomockMetadata(specifier, parentURL);
    if (
      !automockEnabled ||
      explicitlyUnmockedEsmModules.has(coordinates.decisionKey)
    ) {
      return undefined;
    }
    const entry = {
      automatic: true,
      id: nextEsmMockId++,
      specifier: coordinates.moduleName,
      cacheKey: `automock:${coordinates.decisionKey}`,
      canonical: coordinates.canonical,
      decisionKey: coordinates.decisionKey,
      identity: coordinates.identity,
      manualPath,
      relative: coordinates.relative,
      factory: manualPath
        ? () => loadEsmManualMock(manualPath)
        : () => notifyGeneratedMock(generatedModulePath, createAutoMock(actual)),
      generation: 0,
      initialized: false,
      url: undefined,
      value: undefined,
      valueKey: undefined,
    };
    cacheEsmMock(entry, manualPath ? actual : entry.factory());
    const replaced = esmModuleMocks.findIndex(
      candidate =>
        candidate.automatic &&
        candidate.decisionKey === coordinates.decisionKey,
    );
    if (replaced === -1) esmModuleMocks.push(entry);
    else esmModuleMocks[replaced] = entry;
    return entry;
  })();
  pendingEsmAutoMocks.set(coordinates.decisionKey, pending);
  try {
    return await pending;
  } finally {
    pendingEsmAutoMocks.delete(coordinates.decisionKey);
  }
}

function manualMockPath(resolvedModule, specifier, fromPath) {
  const resolved = String(resolvedModule);
  const candidates = [];
  if (Module.isBuiltin(resolved)) {
    const moduleName = resolved.replace(/^node:/, '');
    for (const extension of request.moduleFileExtensions ?? []) {
      candidates.push(join(request.rootDir, '__mocks__', `${moduleName}.${extension}`));
    }
  } else if (resolvePath(resolved) === resolved) {
    const mockDirectory = join(dirname(resolved), '__mocks__');
    candidates.push(join(mockDirectory, basename(resolved)));
    const stem = basename(resolved, extname(resolved));
    for (const extension of request.moduleFileExtensions ?? []) {
      candidates.push(join(mockDirectory, `${stem}.${extension}`));
    }
  }
  return (
    candidates.find(candidate => existsSync(candidate)) ??
    unresolvedManualMockPath(specifier, fromPath)
  );
}

function virtualMockKey(specifier, fromPath) {
  const value = String(specifier);
  if (value.startsWith('.')) return resolvePath(dirname(fromPath), value);
  if (value.startsWith('/')) return resolvePath(value);
  return value;
}

function registerModuleMock(
  specifier,
  factory,
  fromPath = activeModulePath,
  returnValue = jest,
  options = undefined,
) {
  if (factory !== undefined && typeof factory !== 'function') {
    throw new TypeError('The second argument of jest.mock must be a function');
  }
  const virtual = options?.virtual === true;
  const key = virtual
    ? virtualMockKey(specifier, fromPath)
    : resolveModuleKey(specifier, fromPath);
  const registry = virtual ? virtualModuleMocks : moduleMocks;
  registry.set(key, {
    explicit: true,
    factory,
    initialized: false,
    value: undefined,
    specifier: String(specifier),
    fromPath,
    virtual,
  });
  if (virtual && process.env.RJEST_DEBUG_MODULE_MOCKS === '1') {
    consoleEntries.push({
      level: 'debug',
      message: `virtual module mock registered: ${key}`,
    });
  }
  if (!virtual) {
    explicitlyUnmockedModules.delete(key);
    delete Module._cache[key];
  }
  return returnValue;
}

function setModuleMockExports(specifier, value, fromPath, returnValue) {
  return registerModuleMock(
    specifier,
    () => value,
    fromPath,
    returnValue,
  );
}

function registerEsmModuleMock(specifier, factory, fromPath, returnValue) {
  if (typeof factory !== 'function') {
    throw new TypeError('The second argument of jest.unstable_mockModule must be a function');
  }
  const parentURL = pathToFileURL(fromPath).href;
  const coordinates = esmMockCoordinates(specifier, parentURL);
  const entry = {
    automatic: false,
    id: nextEsmMockId++,
    specifier: coordinates.moduleName,
    cacheKey: coordinates.cacheKey,
    canonical: coordinates.canonical,
    decisionKey: coordinates.decisionKey,
    identity: coordinates.identity,
    relative: coordinates.relative,
    factory,
    generation: 0,
    initialized: false,
    url: undefined,
    value: undefined,
    valueKey: undefined,
  };
  adoptCachedEsmMock(entry);
  explicitlyUnmockedEsmModules.delete(coordinates.decisionKey);
  const existing = esmModuleMocks.findIndex(candidate =>
    candidate.decisionKey === coordinates.decisionKey ||
    (entry.relative
      ? candidate.identity === entry.identity
      : !candidate.relative && candidate.specifier === entry.specifier),
  );
  if (existing === -1) esmModuleMocks.push(entry);
  else esmModuleMocks[existing] = entry;
  return returnValue;
}

function unregisterEsmModuleMock(specifier, fromPath, returnValue) {
  const parentURL = pathToFileURL(fromPath).href;
  const coordinates = esmMockCoordinates(specifier, parentURL);
  for (let index = esmModuleMocks.length - 1; index >= 0; index -= 1) {
    const entry = esmModuleMocks[index];
    if (
      entry.decisionKey === coordinates.decisionKey ||
      (coordinates.relative
        ? entry.relative && entry.identity === coordinates.identity
        : !entry.relative && entry.specifier === coordinates.moduleName)
    ) {
      esmModuleMocks.splice(index, 1);
    }
  }
  explicitlyUnmockedEsmModules.add(coordinates.decisionKey);
  return returnValue;
}

function deepUnmockModule(specifier, fromPath, returnValue) {
  const key = resolveModuleKey(specifier, fromPath);
  deeplyUnmockedModules.add(normalizedRuntimePath(key));
  return unmockModule(specifier, fromPath, returnValue);
}

function requireMock(specifier, fromPath = activeModulePath) {
  if (virtualModuleMocks.has(virtualMockKey(specifier, fromPath))) {
    return requireFrom(fromPath)(specifier);
  }
  const key = resolveModuleKey(specifier, fromPath);
  if (!moduleMocks.has(key)) registerModuleMock(specifier, undefined, fromPath);
  return requireFrom(fromPath)(specifier);
}

function unmockModule(specifier, fromPath, returnValue) {
  virtualModuleMocks.delete(virtualMockKey(specifier, fromPath));
  let key;
  try {
    key = resolveModuleKey(specifier, fromPath);
  } catch {
    return returnValue;
  }
  moduleMocks.delete(key);
  explicitlyUnmockedModules.add(key);
  return returnValue;
}

function setAutomock(enabled, returnValue) {
  automockEnabled = enabled;
  return returnValue;
}

Module._load = function rjestModuleLoad(specifier, parent, isMain) {
  if (specifier === '@jest/globals') {
    const moduleJest = scopedJest(parent?.filename ?? request.testPath);
    return {
      afterAll,
      afterEach,
      beforeAll,
      beforeEach,
      describe,
      expect,
      fit: test.only,
      it,
      jest: moduleJest,
      test,
      xdescribe: describe.skip,
      xit: test.skip,
      xtest: test.skip,
    };
  }
  const virtualKey = virtualMockKey(
    specifier,
    parent?.filename ?? request.testPath,
  );
  const virtualEntry = virtualModuleMocks.get(virtualKey);
  if (
    !virtualEntry &&
    process.env.RJEST_DEBUG_MODULE_MOCKS === '1' &&
    virtualKey.includes('/foo/')
  ) {
    consoleEntries.push({
      level: 'debug',
      message: `virtual module mock missed: ${virtualKey}; registered: ${[
        ...virtualModuleMocks.keys(),
      ].join(', ')}`,
    });
  }
  if (virtualEntry) {
    if (!virtualEntry.initialized) {
      virtualEntry.initialized = true;
      const previousModulePath = activeModulePath;
      activeModulePath = virtualEntry.fromPath;
      try {
        virtualEntry.value = virtualEntry.factory
          ? virtualEntry.factory()
          : {};
      } catch (error) {
        virtualEntry.initialized = false;
        throw error;
      } finally {
        activeModulePath = previousModulePath;
      }
    }
    return virtualEntry.value;
  }
  let key;
  try {
    key = Module._resolveFilename(specifier, parent, isMain);
  } catch {
    return Reflect.apply(originalModuleLoad, this, [specifier, parent, isMain]);
  }
  let entry = moduleMocks.get(key);
  const parentPath = parent?.filename ?? request.testPath;
  if (
    entry?.explicit !== true &&
    shouldTransitivelyUnmockModule(key, parentPath)
  ) {
    return Reflect.apply(originalModuleLoad, this, [specifier, parent, isMain]);
  }
  if (
    !entry &&
    shouldAutomockModule(specifier, key, parentPath)
  ) {
    entry = {
      explicit: false,
      factory: undefined,
      initialized: false,
      value: undefined,
      specifier: String(specifier),
      fromPath: parentPath,
    };
    moduleMocks.set(key, entry);
  }
  if (!entry || bypassModuleMocks.has(key)) {
    return Reflect.apply(originalModuleLoad, this, [specifier, parent, isMain]);
  }
  if (!entry.initialized) {
    entry.initialized = true;
    const previousModulePath = activeModulePath;
    activeModulePath = entry.fromPath;
    try {
      const manualPath = entry.factory
        ? undefined
        : manualMockPath(key, entry.specifier, entry.fromPath);
      entry.value = entry.factory
        ? entry.factory()
        : manualPath
          ? loadActualModule(manualPath, entry.fromPath)
          : generateAutoMock(entry.specifier, entry.fromPath);
      if (process.env.RJEST_DEBUG_MODULE_MOCKS === '1') {
        consoleEntries.push({
          level: 'debug',
          message: `module mock ${key}: ${Reflect.ownKeys(Object(entry.value)).map(String).join(', ')}`,
        });
      }
    } catch (error) {
      entry.initialized = false;
      throw error;
    } finally {
      activeModulePath = previousModulePath;
    }
  }
  return entry.value;
};

function scopedJest(fromPath) {
  const scoped = Object.create(jest);
  Object.assign(scoped, {
    mock(specifier, factory, options) {
      return registerModuleMock(specifier, factory, fromPath, scoped, options);
    },
    doMock(specifier, factory, options) {
      return registerModuleMock(specifier, factory, fromPath, scoped, options);
    },
    setMock(specifier, value) {
      return setModuleMockExports(specifier, value, fromPath, scoped);
    },
    unmock(specifier) {
      return unmockModule(specifier, fromPath, scoped);
    },
    dontMock(specifier) {
      return scoped.unmock(specifier);
    },
    requireActual(specifier) {
      return loadActualModule(specifier, fromPath);
    },
    requireMock(specifier) {
      return requireMock(specifier, fromPath);
    },
    createMockFromModule(specifier) {
      return generateAutoMock(specifier, fromPath);
    },
    genMockFromModule(specifier) {
      return generateAutoMock(specifier, fromPath);
    },
    onGenerateMock(callback) {
      onGenerateMockCallbacks.add(callback);
      return scoped;
    },
    enableAutomock() {
      return setAutomock(true, scoped);
    },
    autoMockOn() {
      return scoped.enableAutomock();
    },
    disableAutomock() {
      return setAutomock(false, scoped);
    },
    autoMockOff() {
      return scoped.disableAutomock();
    },
    deepUnmock(specifier) {
      return deepUnmockModule(specifier, fromPath, scoped);
    },
    unstable_mockModule(specifier, factory) {
      return registerEsmModuleMock(specifier, factory, fromPath, scoped);
    },
    unstable_unmockModule(specifier) {
      return unregisterEsmModuleMock(specifier, fromPath, scoped);
    },
    retryTimes(numTestRetries, options) {
      return setRetryTimes(numTestRetries, options, scoped);
    },
  });
  return scoped;
}

async function transformerFromConfig(pattern, configured) {
  const [moduleName, transformerConfig] = Array.isArray(configured)
    ? configured
    : [configured, {}];
  if (typeof moduleName !== 'string') {
    throw new TypeError(`Transformer for ${pattern} must name a module`);
  }
  const cachedBefore = new Set(Object.keys(Module._cache));
  let transformer;
  transformerDepth += 1;
  try {
    let loaded;
    try {
      loaded = requireFromTest(moduleName);
    } catch (error) {
      if (
        error?.code !== 'ERR_REQUIRE_ESM' &&
        error?.code !== 'ERR_REQUIRE_ASYNC_MODULE'
      ) {
        throw error;
      }
      const resolved = requireFromTest.resolve(moduleName);
      loaded = await import(pathToFileURL(resolved).href);
    }
    const exported = loaded?.default ?? loaded;
    transformer =
      typeof exported?.createTransformer === 'function'
        ? await exported.createTransformer(transformerConfig ?? {})
        : exported;
  } finally {
    transformerDepth -= 1;
    for (const path of Object.keys(Module._cache)) {
      if (!cachedBefore.has(path)) delete Module._cache[path];
    }
  }
  if (
    !transformer ||
    (typeof transformer.process !== 'function' &&
      typeof transformer.processAsync !== 'function')
  ) {
    throw new TypeError(
      `Transformer ${moduleName} does not expose process() or processAsync()`,
    );
  }
  return {
    moduleName,
    pattern: new RegExp(pattern),
    transformer,
    transformerConfig: transformerConfig ?? {},
  };
}

async function configureTransforms() {
  for (const [pattern, configured] of Object.entries(request.transform ?? {})) {
    runtimeTransformers.push(await transformerFromConfig(pattern, configured));
  }
  if (runtimeTransformers.length === 0) {
    try {
      let babelJest = 'babel-jest';
      try {
        const jestConfigPackage = requireFromTest.resolve(
          'jest-config/package.json',
        );
        babelJest = createRequire(jestConfigPackage).resolve('babel-jest');
      } catch {
        // Projects without Jest can still provide Babel-Jest directly.
      }
      runtimeTransformers.push(
        await transformerFromConfig('^.+\\.[jt]sx?$', babelJest),
      );
    } catch (error) {
      if (error?.code !== 'MODULE_NOT_FOUND') throw error;
    }
  }
  if (runtimeTransformers.length === 0) return;
  const extensions = new Set(
    (request.moduleFileExtensions ?? []).map(extension => `.${extension}`),
  );
  extensions.add('.js');
  for (const extension of extensions) {
    if (extension === '.json' || extension === '.node') continue;
    Module._extensions[extension] = compileRuntimeModule;
  }
}

function configureSnapshotFormat() {
  for (const moduleName of request.snapshotSerializers ?? []) {
    const loaded = requireFromTest(moduleName);
    const serializer = loaded?.default ?? loaded;
    if (
      !serializer ||
      typeof serializer.test !== 'function' ||
      (typeof serializer.print !== 'function' &&
        typeof serializer.serialize !== 'function')
    ) {
      throw new TypeError(
        `Snapshot serializer ${moduleName} must expose test() and print() or serialize()`,
      );
    }
    runtimeSnapshotSerializers.push(serializer);
  }
  try {
    const loaded = requireFromTest('pretty-format');
    runtimePrettyFormatter =
      typeof loaded === 'function' ? loaded : loaded.format;
    try {
      runtimePrettyFormatter({}, {printBasicPrototype: false});
      runtimePrettyFormatSupportsBasicPrototype = true;
    } catch {
      runtimePrettyFormatSupportsBasicPrototype = false;
    }
    runtimePrettyFormatPlugins = [
      loaded.plugins.AsymmetricMatcher,
      loaded.plugins.DOMCollection,
      loaded.plugins.DOMElement,
      loaded.plugins.Immutable,
      loaded.plugins.ReactElement,
      loaded.plugins.ReactTestComponent,
    ].filter(Boolean);
  } catch {
    runtimePrettyFormatter = undefined;
    runtimePrettyFormatPlugins = [];
  }
}

function runtimeTransformerFor(filename) {
  const normalized = filename.replaceAll('\\', '/');
  const ignored = (request.transformIgnorePatterns ?? []).some(pattern =>
    new RegExp(pattern).test(normalized),
  );
  return ignored
    ? undefined
    : runtimeTransformers.find(({pattern}) => pattern.test(normalized));
}

function shouldInstrument(filename) {
  if (!request.collectCoverage) return false;
  const normalized = normalizedRuntimePath(filename);
  if (normalized === normalizedRuntimePath(request.testPath)) return false;
  if (coverageFilter && !coverageFilter.has(normalized)) return false;
  if (
    [...(request.setupFiles ?? []), ...(request.setupFilesAfterEnv ?? [])].some(
      setupPath => normalized === normalizedRuntimePath(setupPath),
    )
  ) {
    return false;
  }
  return !(request.coveragePathIgnorePatterns ?? []).some(pattern =>
    new RegExp(pattern).test(normalized),
  );
}

function normalizedRuntimePath(path) {
  return resolvePath(path).replaceAll('\\', '/');
}

function compileRuntimeModule(module, filename) {
  if (transformerDepth > 0) {
    const extension = filename.slice(filename.lastIndexOf('.'));
    const original =
      originalModuleExtensions.get(extension) ??
      (extension === '.cjs' ? originalModuleExtensions.get('.js') : undefined);
    if (original) return original(module, filename);
  }
  const selected = runtimeTransformerFor(filename);
  if (!selected) {
    const extension = filename.slice(filename.lastIndexOf('.'));
    const original =
      originalModuleExtensions.get(extension) ??
      (extension === '.cjs' ? originalModuleExtensions.get('.js') : undefined);
    if (original) return original(module, filename);
    throw new Error(`No configured transform can load ${filename}`);
  }
  const source = readFileSync(filename, 'utf8');
  const transformed = transformRuntimeSource(
    selected,
    source,
    filename,
    shouldInstrument(filename),
  );
  const previousModulePath = activeModulePath;
  activeModulePath = filename;
  try {
    module._compile(transformed.code, filename);
  } finally {
    activeModulePath = previousModulePath;
  }
}

function runtimeTransformCacheKey(filename, instrument, supportsStaticEsm) {
  return `${filename}\0${instrument ? 'coverage' : 'plain'}\0${supportsStaticEsm ? 'esm' : 'cjs'}`;
}

function runtimeTransformOptions(selected, instrument, supportsStaticEsm) {
  const config = {
    cwd: request.rootDir,
    rootDir: request.rootDir,
    testEnvironment: effectiveTestEnvironment,
    moduleFileExtensions: request.moduleFileExtensions ?? [],
    moduleDirectories: configuredModuleDirectories,
    extensionsToTreatAsEsm: request.extensionsToTreatAsEsm ?? [],
  };
  const transformOptions = {
    cacheFS: transformCacheFs,
    config,
    configString: JSON.stringify(config),
    instrument,
    rootDir: request.rootDir,
    supportsDynamicImport: supportsStaticEsm,
    supportsExportNamespaceFrom: supportsStaticEsm,
    supportsStaticESM: supportsStaticEsm,
    supportsTopLevelAwait: supportsStaticEsm,
    transformerConfig: selected.transformerConfig,
  };
  return {config, transformOptions};
}

function callTransformerProcess(
  transformer,
  process,
  source,
  filename,
  config,
  transformOptions,
) {
  return process.length >= 4
    ? process.call(transformer, source, filename, config, transformOptions)
    : process.call(transformer, source, filename, transformOptions);
}

function cleanupTransformerModules(cachedBeforeTransform) {
  for (const path of Object.keys(Module._cache)) {
    if (!cachedBeforeTransform.has(path)) delete Module._cache[path];
  }
}

function invokeTransformerSync(selected, source, filename, context) {
  const process = selected.transformer.process;
  if (typeof process !== 'function') {
    throw new TypeError(
      `Transformer ${selected.moduleName} cannot synchronously transform ${filename} without process()`,
    );
  }
  const cachedBeforeTransform = new Set(Object.keys(Module._cache));
  transformerDepth += 1;
  try {
    return callTransformerProcess(
      selected.transformer,
      process,
      source,
      filename,
      context.config,
      context.transformOptions,
    );
  } finally {
    transformerDepth -= 1;
    cleanupTransformerModules(cachedBeforeTransform);
  }
}

async function invokeTransformerAsync(selected, source, filename, context) {
  const process =
    selected.transformer.processAsync ?? selected.transformer.process;
  const cachedBeforeTransform = new Set(Object.keys(Module._cache));
  transformerDepth += 1;
  try {
    return await callTransformerProcess(
      selected.transformer,
      process,
      source,
      filename,
      context.config,
      context.transformOptions,
    );
  } finally {
    transformerDepth -= 1;
    cleanupTransformerModules(cachedBeforeTransform);
  }
}

function finalizeRuntimeTransform(
  selected,
  transformed,
  filename,
  instrument,
  supportsStaticEsm,
  cacheKey,
) {
  if (transformed && typeof transformed.then === 'function') {
    throw new Error(`Async transformer output is not supported for ${filename}`);
  }
  let code = typeof transformed === 'string' ? transformed : transformed?.code;
  if (typeof code !== 'string') {
    throw new TypeError(`Transformer returned no code for ${filename}`);
  }
  let sourceMap = typeof transformed === 'string' ? undefined : transformed?.map;
  if (!sourceMap) {
    transformerDepth += 1;
    try {
      const convertSourceMap = requireFromTest('convert-source-map');
      sourceMap = convertSourceMap.fromSource(code)?.toObject();
    } catch {
      sourceMap = undefined;
    } finally {
      transformerDepth -= 1;
    }
  }
  if (instrument && selected.transformer.canInstrument !== true) {
    transformerDepth += 1;
    try {
      const babel = requireFromTest('@babel/core');
      const loadedPlugin = requireFromTest('babel-plugin-istanbul');
      const plugin = loadedPlugin?.default ?? loadedPlugin;
      const instrumented = babel.transformSync(code, {
        auxiliaryCommentBefore: ' istanbul ignore next ',
        babelrc: false,
        caller: {
          name: '@jest/transform',
          supportsDynamicImport: supportsStaticEsm,
          supportsExportNamespaceFrom: supportsStaticEsm,
          supportsStaticESM: supportsStaticEsm,
          supportsTopLevelAwait: supportsStaticEsm,
        },
        configFile: false,
        filename,
        plugins: [
          [
            plugin,
            {
              compact: false,
              cwd: request.rootDir,
              exclude: [],
              extension: false,
              inputSourceMap: sourceMap,
              useInlineSourceMaps: false,
            },
          ],
        ],
        sourceMaps: sourceMap ? 'both' : false,
      });
      if (typeof instrumented?.code === 'string') {
        code = instrumented.code;
        sourceMap = instrumented.map ?? sourceMap;
      }
    } finally {
      transformerDepth -= 1;
    }
  }
  if (instrument) {
    instrumentedFiles.add(normalizedRuntimePath(filename));
  }
  if (sourceMap) {
    runtimeSourceMaps.set(normalizedRuntimePath(filename), sourceMap);
  }
  const result = {code};
  transformedSourceCache.set(cacheKey, result);
  return result;
}

function transformRuntimeSource(
  selected,
  source,
  filename,
  instrument,
  supportsStaticEsm = false,
) {
  const cacheKey = runtimeTransformCacheKey(
    filename,
    instrument,
    supportsStaticEsm,
  );
  const cached = transformedSourceCache.get(cacheKey);
  if (cached) return cached;
  const context = runtimeTransformOptions(
    selected,
    instrument,
    supportsStaticEsm,
  );
  const transformed = invokeTransformerSync(
    selected,
    source,
    filename,
    context,
  );
  return finalizeRuntimeTransform(
    selected,
    transformed,
    filename,
    instrument,
    supportsStaticEsm,
    cacheKey,
  );
}

async function transformRuntimeSourceAsync(
  selected,
  source,
  filename,
  instrument,
  supportsStaticEsm = false,
) {
  const cacheKey = runtimeTransformCacheKey(
    filename,
    instrument,
    supportsStaticEsm,
  );
  const cached = transformedSourceCache.get(cacheKey);
  if (cached) return cached;
  const inFlight = pendingAsyncTransforms.get(cacheKey);
  if (inFlight) return inFlight;
  const pending = (async () => {
    const context = runtimeTransformOptions(
      selected,
      instrument,
      supportsStaticEsm,
    );
    const transformed = await invokeTransformerAsync(
      selected,
      source,
      filename,
      context,
    );
    return finalizeRuntimeTransform(
      selected,
      transformed,
      filename,
      instrument,
      supportsStaticEsm,
      cacheKey,
    );
  })();
  pendingAsyncTransforms.set(cacheKey, pending);
  try {
    return await pending;
  } finally {
    pendingAsyncTransforms.delete(cacheKey);
  }
}

async function collectUncoveredCoverage() {
  if (!request.collectCoverage || !(request.coverageSources ?? []).length) {
    return;
  }
  const loaded = requireFromTest('istanbul-lib-instrument');
  const readInitialCoverage = loaded?.readInitialCoverage;
  if (typeof readInitialCoverage !== 'function') {
    throw new Error(
      'collectCoverageFrom requires istanbul-lib-instrument.readInitialCoverage()',
    );
  }
  globalThis.__coverage__ ??= {};
  for (const filename of request.coverageSources) {
    if (globalThis.__coverage__[filename]) continue;
    const selected = runtimeTransformerFor(filename);
    if (!selected) {
      throw new Error(
        `No configured transformer can instrument collectCoverageFrom source ${filename}`,
      );
    }
    const source = readFileSync(filename, 'utf8');
    const transformed = await transformRuntimeSourceAsync(
      selected,
      source,
      filename,
      true,
      isEsmRuntimePath(filename),
    );
    const extracted = readInitialCoverage(transformed.code);
    if (extracted?.coverageData) {
      globalThis.__coverage__[extracted.coverageData.path ?? filename] =
        extracted.coverageData;
    }
  }
}

async function collectedCoverage() {
  if (!request.collectCoverage) return {};
  const collected = Object.fromEntries(
    Object.entries(globalThis.__coverage__ ?? {}).filter(([filename]) =>
      instrumentedFiles.has(normalizedRuntimePath(filename)),
    ),
  );
  if (!Object.values(collected).some(coverage => coverage.inputSourceMap)) {
    return collected;
  }
  transformerDepth += 1;
  try {
    const {createCoverageMap} = requireFromTest('istanbul-lib-coverage');
    const {createSourceMapStore} = requireFromTest('istanbul-lib-source-maps');
    const store = createSourceMapStore({baseDir: request.rootDir});
    const remapped = await store.transformCoverage(createCoverageMap(collected));
    store.dispose();
    return remapped.toJSON();
  } finally {
    transformerDepth -= 1;
  }
}

function configureFileEnvironment() {
  const source = readFileSync(request.testPath, 'utf8');
  const pragmas = parseDocblockPragmas(source);
  fileDocblockPragmas = pragmas;
  const customEnvironment = pragmas['jest-environment'];
  if (Array.isArray(customEnvironment)) {
    throw new TypeError(
      `You can only define a single test environment through docblocks, got "${customEnvironment.join(', ')}"`,
    );
  }
  if (typeof customEnvironment === 'string' && customEnvironment) {
    effectiveTestEnvironment = customEnvironment;
  }
  const environmentOptions = pragmas['jest-environment-options'];
  if (typeof environmentOptions === 'string') {
    effectiveTestEnvironmentOptions = {
      ...effectiveTestEnvironmentOptions,
      ...JSON.parse(environmentOptions),
    };
  }
}

function isBuiltinNodeEnvironment(environment) {
  return environment === 'node' || environment === 'jest-environment-node';
}

function isBuiltinJsdomEnvironment(environment) {
  return environment === 'jsdom' || environment === 'jest-environment-jsdom';
}

function isBuiltinTestEnvironment(environment) {
  return (
    isBuiltinNodeEnvironment(environment) ||
    isBuiltinJsdomEnvironment(environment)
  );
}

function customEnvironmentProjectConfig() {
  return {
    automock: Boolean(request.automock),
    clearMocks: Boolean(request.clearMocks),
    extensionsToTreatAsEsm: request.extensionsToTreatAsEsm ?? [],
    fakeTimers: request.fakeTimers ?? {},
    globals: {},
    moduleDirectories: configuredModuleDirectories,
    moduleFileExtensions: request.moduleFileExtensions ?? [],
    moduleNameMapper: request.moduleNameMapper ?? [],
    modulePaths: request.modulePaths ?? [],
    resetMocks: Boolean(request.resetMocks),
    resetModules: Boolean(request.resetModules),
    resolver: request.resolver,
    restoreMocks: Boolean(request.restoreMocks),
    rootDir: request.rootDir,
    setupFiles: request.setupFiles ?? [],
    setupFilesAfterEnv: request.setupFilesAfterEnv ?? [],
    snapshotSerializers: request.snapshotSerializers ?? [],
    testEnvironment: effectiveTestEnvironment,
    testEnvironmentOptions: effectiveTestEnvironmentOptions,
    testMatch: [],
    testRegex: [],
    transform: request.transform ?? {},
    transformIgnorePatterns: request.transformIgnorePatterns ?? [],
  };
}

function customEnvironmentGlobalConfig() {
  return {
    bail: 0,
    collectCoverage: Boolean(request.collectCoverage),
    maxWorkers: 1,
    rootDir: request.rootDir,
    seed: request.seed,
    testNamePattern: request.testNamePattern,
    updateSnapshot: request.snapshotUpdate,
  };
}

async function loadCustomEnvironmentConstructor() {
  const sourceRequire = createRequire(request.testPath);
  const configured = String(effectiveTestEnvironment);
  const candidates =
    isAbsolute(configured) || configured.startsWith('.')
      ? [configured]
      : configured.startsWith('jest-environment-')
        ? [configured]
        : [`jest-environment-${configured}`, configured];
  let resolved;
  let resolutionError;
  for (const candidate of candidates) {
    try {
      resolved = sourceRequire.resolve(candidate);
      break;
    } catch (error) {
      resolutionError = error;
    }
  }
  if (!resolved) throw resolutionError;
  let loaded;
  try {
    loaded = sourceRequire(resolved);
  } catch (error) {
    if (
      error?.code !== 'ERR_REQUIRE_ESM' &&
      error?.code !== 'ERR_REQUIRE_ASYNC_MODULE'
    ) {
      throw error;
    }
    loaded = await import(pathToFileURL(resolved).href);
  }
  const candidate = loaded?.default ?? loaded?.TestEnvironment ?? loaded;
  if (typeof candidate !== 'function') {
    throw new TypeError(
      `Test environment found at "${resolved}" does not export a constructor`,
    );
  }
  return {Environment: candidate, resolved};
}

const customEnvironmentRealmIntrinsics = new Set([
  'AggregateError',
  'Array',
  'ArrayBuffer',
  'Atomics',
  'BigInt',
  'BigInt64Array',
  'BigUint64Array',
  'Boolean',
  'DataView',
  'Date',
  'Error',
  'EvalError',
  'FinalizationRegistry',
  'Float32Array',
  'Float64Array',
  'Function',
  'Int8Array',
  'Int16Array',
  'Int32Array',
  'Intl',
  'JSON',
  'Map',
  'Math',
  'Number',
  'Object',
  'Promise',
  'Proxy',
  'RangeError',
  'ReferenceError',
  'Reflect',
  'RegExp',
  'Set',
  'SharedArrayBuffer',
  'String',
  'Symbol',
  'SyntaxError',
  'TypeError',
  'URIError',
  'Uint8Array',
  'Uint8ClampedArray',
  'Uint16Array',
  'Uint32Array',
  'WeakMap',
  'WeakRef',
  'WeakSet',
  'WebAssembly',
]);

function projectCustomEnvironmentGlobals() {
  const environmentGlobal = customTestEnvironment?.global;
  if (!environmentGlobal || typeof environmentGlobal !== 'object') return;
  const projections = [];
  for (const key of Reflect.ownKeys(environmentGlobal)) {
    if (
      key === 'global' ||
      key === 'globalThis' ||
      customEnvironmentRealmIntrinsics.has(key)
    ) {
      continue;
    }
    let descriptor = Object.getOwnPropertyDescriptor(environmentGlobal, key);
    if (!descriptor) continue;
    const current = Object.getOwnPropertyDescriptor(globalThis, key);
    if (current && !current.configurable) continue;
    let value;
    try {
      value = Reflect.get(environmentGlobal, key, environmentGlobal);
      descriptor = Object.getOwnPropertyDescriptor(environmentGlobal, key) ?? descriptor;
    } catch {
      continue;
    }
    projections.push({descriptor, key, value});
  }
  for (const projection of projections) {
    const {descriptor, key} = projection;
    let projectedValue = projection.value;
    try {
      Object.defineProperty(globalThis, key, {
        configurable: true,
        enumerable: descriptor.enumerable,
        get() {
          return projectedValue === environmentGlobal ? globalThis : projectedValue;
        },
        set(value) {
          projectedValue = value === globalThis ? environmentGlobal : value;
          Reflect.set(
            environmentGlobal,
            key,
            projectedValue,
            environmentGlobal,
          );
        },
      });
    } catch {
      // Custom environments can expose host properties protected by Node.
    }
  }
}

async function configureCustomTestEnvironment() {
  if (isBuiltinTestEnvironment(effectiveTestEnvironment)) return;
  const {Environment, resolved} = await loadCustomEnvironmentConstructor();
  customTestEnvironment = new Environment(
    {
      globalConfig: customEnvironmentGlobalConfig(),
      projectConfig: customEnvironmentProjectConfig(),
    },
    {
      console,
      docblockPragmas: fileDocblockPragmas,
      testPath: request.testPath,
    },
  );
  if (typeof customTestEnvironment?.getVmContext !== 'function') {
    throw new TypeError(
      `Test environment found at "${resolved}" does not export a "getVmContext" method, which is mandatory from Jest 27`,
    );
  }
  if (!customTestEnvironment.global || typeof customTestEnvironment.global !== 'object') {
    throw new TypeError(`Test environment found at "${resolved}" has no global object`);
  }
  customTestEnvironment.global.console = console;
  projectCustomEnvironmentGlobals();
}

async function setupCustomTestEnvironment() {
  if (!customTestEnvironment) return;
  if (typeof customTestEnvironment.setup === 'function') {
    await customTestEnvironment.setup();
  }
  projectCustomEnvironmentGlobals();
}

function customEnvironmentState() {
  return {
    currentDescribeBlock: currentSuite,
    currentlyRunningTest: activeTest,
    hasFocusedTests: hasOnly(rootSuite),
    hasStarted: definitionComplete,
    rootDescribeBlock: rootSuite,
    seed: request.seed,
    testNamePattern: request.testNamePattern,
    testTimeout: defaultTimeout,
    unhandledErrors: [],
  };
}

async function dispatchCustomEnvironmentEvent(event) {
  if (typeof customTestEnvironment?.handleTestEvent !== 'function') return;
  await customTestEnvironment.handleTestEvent(event, customEnvironmentState());
  projectCustomEnvironmentGlobals();
}

function dispatchCustomEnvironmentSyncEvent(event) {
  if (typeof customTestEnvironment?.handleTestEvent !== 'function') return;
  customTestEnvironment.handleTestEvent(event, customEnvironmentState());
  projectCustomEnvironmentGlobals();
}

async function teardownCustomTestEnvironment() {
  if (!customTestEnvironment) return;
  let eventError;
  try {
    await dispatchCustomEnvironmentEvent({name: 'teardown'});
  } catch (error) {
    eventError = error;
  }
  try {
    if (typeof customTestEnvironment.teardown === 'function') {
      await customTestEnvironment.teardown();
    }
  } finally {
    if (eventError) throw eventError;
  }
}

function parseDocblockPragmas(source) {
  try {
    const docblock = requireFromTest('jest-docblock');
    return docblock.parse(docblock.extract(source));
  } catch {
    const docblock = source.match(/^\s*\/\*\*[\s\S]*?\*\//)?.[0] ?? '';
    const pragmas = Object.create(null);
    for (const match of docblock.matchAll(/@([\w-]+)(?:[ \t]+([^\r\n*]*))?/g)) {
      const name = match[1];
      const value = match[2]?.trim() ?? '';
      const previous = pragmas[name];
      pragmas[name] =
        previous === undefined
          ? value
          : Array.isArray(previous)
            ? [...previous, value]
            : [previous, value];
    }
    return pragmas;
  }
}

function installJsdomEnvironment() {
  if (!isBuiltinJsdomEnvironment(effectiveTestEnvironment)) return;
  const existingGlobalDescriptors = Object.getOwnPropertyDescriptors(globalThis);
  const {JSDOM} = requireFromTest('jsdom');
  const environmentOptions = effectiveTestEnvironmentOptions;
  jsdomEnvironment = new JSDOM(
    '<!doctype html><html><head></head><body></body></html>',
    {
      pretendToBeVisual: true,
      runScripts: 'outside-only',
      url: environmentOptions.url ?? 'http://localhost/',
    },
  );
  const window = jsdomEnvironment.window;
  const protectedGlobals = new Set([
    'AggregateError',
    'Array',
    'Atomics',
    'BigInt',
    'BigInt64Array',
    'BigUint64Array',
    'Boolean',
    'DataView',
    'Date',
    'Error',
    'EvalError',
    'FinalizationRegistry',
    'Float32Array',
    'Float64Array',
    'Function',
    'Int8Array',
    'Int16Array',
    'Int32Array',
    'Intl',
    'JSON',
    'Map',
    'Math',
    'Number',
    'Object',
    'Promise',
    'Proxy',
    'RangeError',
    'ReferenceError',
    'Reflect',
    'RegExp',
    'Set',
    'SharedArrayBuffer',
    'String',
    'Symbol',
    'SyntaxError',
    'TypeError',
    'URIError',
    'Uint8Array',
    'Uint8ClampedArray',
    'Uint16Array',
    'Uint32Array',
    'WeakMap',
    'WeakRef',
    'WeakSet',
    'WebAssembly',
    'console',
    'decodeURI',
    'decodeURIComponent',
    'encodeURI',
    'encodeURIComponent',
    'escape',
    'eval',
    'global',
    'globalThis',
    'isFinite',
    'isNaN',
    'parseFloat',
    'parseInt',
    'setTimeout',
    'clearTimeout',
    'setInterval',
    'clearInterval',
    'setImmediate',
    'clearImmediate',
    'queueMicrotask',
    'performance',
    'window',
    'self',
    'document',
    'navigator',
    'unescape',
  ]);
  for (const key of Reflect.ownKeys(window)) {
    if (protectedGlobals.has(key)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(window, key);
    if (!descriptor) continue;
    const current = existingGlobalDescriptors[key];
    if (current && !current.configurable) continue;
    try {
      Object.defineProperty(globalThis, key, descriptor);
    } catch {
      // JSDOM exposes a few host properties that Node deliberately protects.
    }
  }
  for (const key of ['TextEncoder', 'TextDecoder']) {
    if (!(key in window)) delete globalThis[key];
  }
  for (const key of ['window', 'self']) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      enumerable: true,
      get: () => window[key],
      set: value => {
        try {
          window[key] = value;
        } catch {
          // JSDOM exposes `window` as read-only in recent releases.
        }
      },
    });
  }
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    enumerable: true,
    get: () => window.document,
    // Jest's VM global ignores assignment to this getter through its proxy.
    // A no-op setter preserves that observable behavior in the Node worker.
    set: () => {},
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    enumerable: true,
    get: () => window.navigator,
    set: value => {
      Object.defineProperty(window, 'navigator', {
        configurable: true,
        enumerable: true,
        value,
        writable: true,
      });
    },
  });
  for (const key of ['XMLHttpRequest', 'FileReader', 'ReadableStream']) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      enumerable: true,
      get: () => window[key],
      set: value => {
        Object.defineProperty(window, key, {
          configurable: true,
          enumerable: true,
          value,
          writable: true,
        });
      },
    });
  }
  for (const key of [
    'localStorage',
    'sessionStorage',
    'indexedDB',
    'IDBCursor',
    'IDBCursorWithValue',
    'IDBDatabase',
    'IDBFactory',
    'IDBIndex',
    'IDBKeyRange',
    'IDBObjectStore',
    'IDBOpenDBRequest',
    'IDBRequest',
    'IDBTransaction',
    'IDBVersionChangeEvent',
  ]) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      enumerable: true,
      get: () => window[key],
      set: value => {
        Object.defineProperty(window, key, {
          configurable: true,
          enumerable: true,
          value,
          writable: true,
        });
      },
    });
  }
  nativeWindowTimers = {
    setTimeout: window.setTimeout,
    clearTimeout: window.clearTimeout,
    setInterval: window.setInterval,
    clearInterval: window.clearInterval,
    queueMicrotask: window.queueMicrotask,
    requestAnimationFrame: window.requestAnimationFrame,
    cancelAnimationFrame: window.cancelAnimationFrame,
  };
}

async function loadRuntimeModule(path) {
  if (isEsmRuntimePath(path)) {
    const url = `${pathToFileURL(path).href}?rjest=${Date.now()}`;
    await prepareEsmGraph(url);
    return import(url);
  }
  if (runtimeTransformerFor(path)) return requireFromTest(path);
  if (runtimeTransformers.length > 0 && !/\.(?:mjs|mts)$/.test(path)) {
    return requireFromTest(path);
  }
  return import(`${pathToFileURL(path).href}?rjest=${Date.now()}`);
}

function createFakeTimerState() {
  return {
    now: 0,
    monotonicNow: 0,
    nextId: 1,
    timers: new Map(),
    ticks: [],
    immediates: [],
    cancelledTicks: new Set(),
  };
}

const fakeTimerStates = {
  modern: createFakeTimerState(),
  legacy: createFakeTimerState(),
};

const fakeTimers = {
  active: false,
  mode: 'modern',
  maxRuns: 100_000,
  autoAdvanceHandle: undefined,
  get now() {
    return fakeTimerStates[this.mode].now;
  },
  set now(value) {
    fakeTimerStates[this.mode].now = value;
  },
  get monotonicNow() {
    return fakeTimerStates[this.mode].monotonicNow;
  },
  set monotonicNow(value) {
    fakeTimerStates[this.mode].monotonicNow = value;
  },
  get nextId() {
    return fakeTimerStates[this.mode].nextId;
  },
  set nextId(value) {
    fakeTimerStates[this.mode].nextId = value;
  },
  get timers() {
    return fakeTimerStates[this.mode].timers;
  },
  get ticks() {
    return fakeTimerStates[this.mode].ticks;
  },
  get immediates() {
    return fakeTimerStates[this.mode].immediates;
  },
  get cancelledTicks() {
    return fakeTimerStates[this.mode].cancelledTicks;
  },
};

function assertFakeTimers() {
  if (!fakeTimers.active) {
    throw new Error(
      'Fake timers are not active. Call jest.useFakeTimers() before using timer controls.',
    );
  }
}

function timerDelay(value) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.floor(number);
}

function timerAdvanceDuration(value) {
  if (
    fakeTimers.mode === 'legacy' &&
    value !== null &&
    typeof value === 'object' &&
    typeof value.total === 'function'
  ) {
    return Number(value.total({unit: 'millisecond'}));
  }
  if (fakeTimers.mode === 'legacy') return Number(value ?? 0);
  return timerDelay(value);
}

function timeToNextFrame() {
  return 16 - (fakeTimers.monotonicNow % 16);
}

function scheduleFakeTimer(type, callback, delay, args) {
  if (fakeTimers.mode !== 'legacy' && typeof callback !== 'function') {
    throw new TypeError(`${type} callback must be a function`);
  }
  const id = fakeTimers.nextId++;
  let duration;
  if (type === 'immediate') {
    duration = 0;
  } else if (fakeTimers.mode === 'legacy' && type === 'interval') {
    duration = delay == null ? 0 : delay;
  } else if (fakeTimers.mode === 'legacy') {
    duration = Number(delay) | 0;
  } else {
    duration = timerDelay(delay);
  }
  fakeTimers.timers.set(id, {
    id,
    type,
    callback,
    args,
    callAt: fakeTimers.now + duration,
    interval:
      type === 'interval'
        ? fakeTimers.mode === 'legacy'
          ? duration
          : Math.max(1, duration)
        : undefined,
  });
  return legacyTimerReference(id);
}

function legacyTimerReference(id) {
  if (fakeTimers.mode !== 'legacy' || jsdomEnvironment) return id;
  return {
    id,
    ref() {
      return this;
    },
    unref() {
      return this;
    },
  };
}

function timerReferenceId(reference) {
  if (fakeTimers.mode === 'legacy') {
    if (jsdomEnvironment) return reference;
    return reference?.id;
  }
  return Number(reference);
}

function nextFakeTimer(limit = Number.POSITIVE_INFINITY, allowedIds) {
  let selected;
  for (const timer of fakeTimers.timers.values()) {
    if (timer.callAt > limit || (allowedIds && !allowedIds.has(timer.id))) {
      continue;
    }
    if (
      !selected ||
      timer.callAt < selected.callAt ||
      (timer.callAt === selected.callAt && timer.id < selected.id)
    ) {
      selected = timer;
    }
  }
  return selected;
}

function runAllTicks() {
  assertFakeTimers();
  let runs = 0;
  while (fakeTimers.ticks.length > 0) {
    if (++runs > fakeTimers.maxRuns) {
      throw new Error(
        `Aborting after running ${fakeTimers.maxRuns} ticks, assuming an infinite loop`,
      );
    }
    const tick = fakeTimers.ticks.shift();
    if (fakeTimers.mode === 'legacy') {
      runLegacyTick(tick);
    } else {
      tick.callback(...tick.args);
    }
  }
  return jest;
}

function runLegacyTick(tick) {
  const {cancelledTicks} = fakeTimerStates.legacy;
  if (cancelledTicks.has(tick.id)) return;
  cancelledTicks.add(tick.id);
  tick.callback.apply(null, tick.args);
}

function clearLegacyImmediate(id) {
  const state = fakeTimerStates.legacy;
  state.immediates = state.immediates.filter(immediate => immediate.id !== id);
}

function runLegacyImmediate(immediate) {
  try {
    immediate.callback.apply(null, immediate.args);
  } finally {
    clearLegacyImmediate(immediate.id);
  }
}

function scheduleLegacyImmediate(callback, args) {
  const state = fakeTimerStates.legacy;
  const id = String(state.nextId++);
  state.immediates.push({id, callback, args});
  if (typeof nativeSetImmediate === 'function') {
    nativeSetImmediate(() => {
      const pending = state.immediates.find(immediate => immediate.id === id);
      if (pending) runLegacyImmediate(pending);
    });
  }
  return id;
}

function runAllLegacyImmediates() {
  assertFakeTimers();
  if (fakeTimers.mode !== 'legacy') {
    throw new TypeError(
      '`jest.runAllImmediates()` is only available when using legacy fake timers.',
    );
  }
  let runs = 0;
  while (fakeTimers.immediates.length > 0) {
    if (++runs > fakeTimers.maxRuns) {
      throw new Error(
        `Ran ${fakeTimers.maxRuns} immediates, and there are still more! Assuming we've hit an infinite recursion and bailing out...`,
      );
    }
    runLegacyImmediate(fakeTimers.immediates[0]);
  }
  return jest;
}

function runTimer(timer) {
  fakeTimers.timers.delete(timer.id);
  fakeTimers.monotonicNow += timer.callAt - fakeTimers.now;
  fakeTimers.now = timer.callAt;
  if (timer.type === 'interval') {
    timer.callAt =
      fakeTimers.mode === 'legacy'
        ? fakeTimers.now + (timer.interval || 0)
        : timer.callAt + timer.interval;
    fakeTimers.timers.set(timer.id, timer);
  }
  if (fakeTimers.mode === 'legacy') {
    timer.callback.apply(null, timer.args);
  } else {
    timer.callback(...timer.args);
  }
  if (fakeTimers.mode !== 'legacy') runAllTicks();
}

function runTimersUntil(target, allowedIds) {
  let runs = 0;
  let timer;
  while ((timer = nextFakeTimer(target, allowedIds))) {
    if (++runs > fakeTimers.maxRuns) {
      throw new Error(
        `Aborting after running ${fakeTimers.maxRuns} timers, assuming an infinite loop`,
      );
    }
    runTimer(timer);
  }
  fakeTimers.monotonicNow += target - fakeTimers.now;
  fakeTimers.now = target;
}

async function runTimersUntilAsync(target) {
  let runs = 0;
  let timer;
  while ((timer = nextFakeTimer(target))) {
    if (++runs > fakeTimers.maxRuns) {
      throw new Error(
        `Aborting after running ${fakeTimers.maxRuns} timers, assuming an infinite loop`,
      );
    }
    runTimer(timer);
    await Promise.resolve();
  }
  fakeTimers.monotonicNow += target - fakeTimers.now;
  fakeTimers.now = target;
}

function installFakeTimers(options = {}) {
  options = {
    ...(request.fakeTimers ?? {}),
    ...(options ?? {}),
  };
  const mode =
    options !== null &&
    typeof options === 'object' &&
    options.legacyFakeTimers === true
      ? 'legacy'
      : 'modern';
  if (fakeTimers.active) restoreRealTimers();
  fakeTimers.active = true;
  fakeTimers.mode = mode;
  fakeTimers.maxRuns =
    mode === 'modern' && Number(options.timerLimit) > 0
      ? Number(options.timerLimit)
      : 100_000;
  nativeAnimationFrame = {
    request: globalThis.requestAnimationFrame,
    cancel: globalThis.cancelAnimationFrame,
  };
  if (mode === 'legacy') {
    installLegacyFakeTimerApis();
    return jest;
  }
  fakeTimers.now =
    options?.now === undefined
      ? NativeDate.now()
      : new NativeDate(options.now).getTime();
  fakeTimers.monotonicNow = 0;
  fakeTimers.nextId = 1;
  fakeTimers.timers.clear();
  fakeTimers.ticks.length = 0;
  const doNotFake = new Set(options?.doNotFake ?? []);
  const fakeSetTimeout = (callback, delay, ...args) =>
    scheduleFakeTimer('timeout', callback, delay, args);
  fakeSetTimeout.clock = fakeTimers;
  const fakeClearTimeout = id => fakeTimers.timers.delete(timerReferenceId(id));
  if (!doNotFake.has('setTimeout')) {
    globalThis.setTimeout = fakeSetTimeout;
    if (jsdomEnvironment) {
      jsdomEnvironment.window.setTimeout = fakeSetTimeout;
    }
  }
  if (!doNotFake.has('clearTimeout')) {
    globalThis.clearTimeout = fakeClearTimeout;
    if (jsdomEnvironment) {
      jsdomEnvironment.window.clearTimeout = fakeClearTimeout;
    }
  }
  const fakeSetInterval = (callback, delay, ...args) =>
    scheduleFakeTimer('interval', callback, delay, args);
  fakeSetInterval.clock = fakeTimers;
  const fakeClearInterval = id => fakeTimers.timers.delete(timerReferenceId(id));
  if (!doNotFake.has('setInterval')) {
    globalThis.setInterval = fakeSetInterval;
    if (jsdomEnvironment) {
      jsdomEnvironment.window.setInterval = fakeSetInterval;
    }
  }
  if (!doNotFake.has('clearInterval')) {
    globalThis.clearInterval = fakeClearInterval;
    if (jsdomEnvironment) {
      jsdomEnvironment.window.clearInterval = fakeClearInterval;
    }
  }
  const fakeSetImmediate = (callback, ...args) =>
    scheduleFakeTimer('immediate', callback, 0, args);
  const fakeClearImmediate = id =>
    fakeTimers.timers.delete(timerReferenceId(id));
  if (!doNotFake.has('setImmediate')) {
    globalThis.setImmediate = fakeSetImmediate;
  }
  if (!doNotFake.has('clearImmediate')) {
    globalThis.clearImmediate = fakeClearImmediate;
  }
  if (!doNotFake.has('nextTick')) {
    process.nextTick = (callback, ...args) => {
      if (typeof callback !== 'function') {
        throw new TypeError('process.nextTick callback must be a function');
      }
      fakeTimers.ticks.push({callback, args});
    };
  }
  if (!doNotFake.has('queueMicrotask')) {
    const fakeQueueMicrotask = callback => {
      if (typeof callback !== 'function') {
        throw new TypeError('queueMicrotask callback must be a function');
      }
      fakeTimers.ticks.push({callback, args: []});
    };
    globalThis.queueMicrotask = fakeQueueMicrotask;
    if (jsdomEnvironment) {
      jsdomEnvironment.window.queueMicrotask = fakeQueueMicrotask;
    }
  }
  if (
    !doNotFake.has('requestAnimationFrame') &&
    typeof nativeAnimationFrame.request === 'function'
  ) {
    const fakeRequestAnimationFrame = callback => {
      if (typeof callback !== 'function') {
        throw new TypeError('requestAnimationFrame expects a callback function');
      }
      return scheduleFakeTimer(
        'animationFrame',
        () => callback(fakeTimers.monotonicNow),
        timeToNextFrame(),
        [],
      );
    };
    globalThis.requestAnimationFrame = fakeRequestAnimationFrame;
    if (jsdomEnvironment) {
      jsdomEnvironment.window.requestAnimationFrame = fakeRequestAnimationFrame;
    }
  }
  if (
    !doNotFake.has('cancelAnimationFrame') &&
    typeof nativeAnimationFrame.cancel === 'function'
  ) {
    const fakeCancelAnimationFrame = id => {
      fakeTimers.timers.delete(timerReferenceId(id));
    };
    globalThis.cancelAnimationFrame = fakeCancelAnimationFrame;
    if (jsdomEnvironment) {
      jsdomEnvironment.window.cancelAnimationFrame = fakeCancelAnimationFrame;
    }
  }
  if (!doNotFake.has('Date')) {
    globalThis.Date = class FakeDate extends NativeDate {
      constructor(...args) {
        super(...(args.length === 0 ? [fakeTimers.now] : args));
      }

      static now() {
        return fakeTimers.now;
      }
    };
  }
  if (!doNotFake.has('performance')) {
    Object.defineProperty(nativePerformance, 'now', {
      configurable: true,
      enumerable: true,
      value: () => fakeTimers.monotonicNow,
    });
  }
  if (!doNotFake.has('hrtime')) {
    const fakeHrtime = previous => {
      let seconds = Math.floor(fakeTimers.monotonicNow / 1000);
      let nanoseconds = Math.floor((fakeTimers.monotonicNow % 1000) * 1e6);
      if (previous !== undefined) {
        seconds -= Number(previous[0]);
        nanoseconds -= Number(previous[1]);
        if (nanoseconds < 0) {
          seconds -= 1;
          nanoseconds += 1e9;
        }
      }
      return [seconds, nanoseconds];
    };
    fakeHrtime.bigint = () => BigInt(Math.floor(fakeTimers.monotonicNow * 1e6));
    process.hrtime = fakeHrtime;
  }
  installAutomaticTimerAdvance(options.advanceTimers);
  return jest;
}

function installAutomaticTimerAdvance(configured) {
  if (!configured) return;
  const delta = typeof configured === 'number' ? configured : 20;
  fakeTimers.autoAdvanceHandle = nativeSetInterval(() => {
    if (!fakeTimers.active || fakeTimers.mode !== 'modern') return;
    runTimersUntil(fakeTimers.now + delta);
  }, delta);
}

function stopAutomaticTimerAdvance() {
  if (fakeTimers.autoAdvanceHandle === undefined) return;
  nativeClearInterval(fakeTimers.autoAdvanceHandle);
  fakeTimers.autoAdvanceHandle = undefined;
}

function installLegacyFakeTimerApis() {
  const fakeSetTimeout = createMock((callback, delay, ...args) =>
    scheduleFakeTimer('timeout', callback, delay, args),
  );
  fakeSetTimeout[promisify.custom] = (delay, value) =>
    new Promise(resolve => fakeSetTimeout(resolve, delay, value));
  const fakeClearTimeout = createMock(reference => {
    fakeTimers.timers.delete(timerReferenceId(reference));
  });
  const fakeSetInterval = createMock((callback, delay, ...args) =>
    scheduleFakeTimer('interval', callback, delay, args),
  );
  const fakeClearInterval = createMock(reference => {
    fakeTimers.timers.delete(timerReferenceId(reference));
  });

  globalThis.setTimeout = fakeSetTimeout;
  globalThis.clearTimeout = fakeClearTimeout;
  globalThis.setInterval = fakeSetInterval;
  globalThis.clearInterval = fakeClearInterval;
  if (jsdomEnvironment) {
    jsdomEnvironment.window.setTimeout = fakeSetTimeout;
    jsdomEnvironment.window.clearTimeout = fakeClearTimeout;
    jsdomEnvironment.window.setInterval = fakeSetInterval;
    jsdomEnvironment.window.clearInterval = fakeClearInterval;
  }

  if (typeof nativeSetImmediate === 'function') {
    const fakeSetImmediate = createMock((callback, ...args) =>
      scheduleLegacyImmediate(callback, args),
    );
    const fakeClearImmediate = createMock(clearLegacyImmediate);
    globalThis.setImmediate = fakeSetImmediate;
    globalThis.clearImmediate = fakeClearImmediate;
  }

  const fakeNextTick = createMock((callback, ...args) => {
    const state = fakeTimerStates.legacy;
    const id = String(state.nextId++);
    const tick = {id, callback, args};
    state.ticks.push(tick);
    nativeNextTick(() => runLegacyTick(tick));
  });
  process.nextTick = fakeNextTick;

  if (typeof nativeAnimationFrame.request === 'function') {
    const fakeRequestAnimationFrame = createMock(callback =>
      scheduleFakeTimer(
        'timeout',
        () => callback(fakeTimers.now),
        1000 / 60,
        [],
      ),
    );
    globalThis.requestAnimationFrame = fakeRequestAnimationFrame;
    if (jsdomEnvironment) {
      jsdomEnvironment.window.requestAnimationFrame = fakeRequestAnimationFrame;
    }
  }
  if (typeof nativeAnimationFrame.cancel === 'function') {
    const fakeCancelAnimationFrame = createMock(reference => {
      fakeTimers.timers.delete(timerReferenceId(reference));
    });
    globalThis.cancelAnimationFrame = fakeCancelAnimationFrame;
    if (jsdomEnvironment) {
      jsdomEnvironment.window.cancelAnimationFrame = fakeCancelAnimationFrame;
    }
  }
}

function restoreRealTimers() {
  stopAutomaticTimerAdvance();
  globalThis.setTimeout = nativeSetTimeout;
  globalThis.clearTimeout = nativeClearTimeout;
  globalThis.setInterval = nativeSetInterval;
  globalThis.clearInterval = nativeClearInterval;
  globalThis.setImmediate = nativeSetImmediate;
  globalThis.clearImmediate = nativeClearImmediate;
  globalThis.queueMicrotask = nativeQueueMicrotask;
  globalThis.Date = NativeDate;
  globalThis.performance = nativePerformance;
  if (nativePerformanceNowDescriptor) {
    Object.defineProperty(
      nativePerformance,
      'now',
      nativePerformanceNowDescriptor,
    );
  } else {
    delete nativePerformance.now;
  }
  process.nextTick = nativeNextTick;
  process.hrtime = nativeHrtime;
  if (nativeAnimationFrame) {
    if (nativeAnimationFrame.request === undefined) {
      delete globalThis.requestAnimationFrame;
    } else {
      globalThis.requestAnimationFrame = nativeAnimationFrame.request;
    }
    if (nativeAnimationFrame.cancel === undefined) {
      delete globalThis.cancelAnimationFrame;
    } else {
      globalThis.cancelAnimationFrame = nativeAnimationFrame.cancel;
    }
  }
  if (jsdomEnvironment && nativeWindowTimers) {
    Object.assign(jsdomEnvironment.window, nativeWindowTimers);
  }
  fakeTimers.active = false;
  if (fakeTimers.mode !== 'legacy') {
    fakeTimers.timers.clear();
    fakeTimers.ticks.length = 0;
    fakeTimers.immediates.length = 0;
    fakeTimers.cancelledTicks.clear();
  }
  return jest;
}

const jest = {
  fn: createMock,
  spyOn,
  replaceProperty,
  isMockFunction: isMock,
  mocked(value) {
    return value;
  },
  mock(specifier, factory, options) {
    return registerModuleMock(
      specifier,
      factory,
      activeModulePath,
      jest,
      options,
    );
  },
  doMock(specifier, factory, options) {
    return registerModuleMock(
      specifier,
      factory,
      activeModulePath,
      jest,
      options,
    );
  },
  setMock(specifier, value) {
    return setModuleMockExports(specifier, value, activeModulePath, jest);
  },
  unmock(specifier) {
    return unmockModule(specifier, activeModulePath, jest);
  },
  dontMock(specifier) {
    return jest.unmock(specifier);
  },
  requireActual: loadActualModule,
  requireMock,
  createMockFromModule(specifier) {
    return generateAutoMock(specifier);
  },
  genMockFromModule(specifier) {
    return generateAutoMock(specifier);
  },
  onGenerateMock(callback) {
    onGenerateMockCallbacks.add(callback);
    return jest;
  },
  enableAutomock() {
    return setAutomock(true, jest);
  },
  autoMockOn() {
    return jest.enableAutomock();
  },
  disableAutomock() {
    return setAutomock(false, jest);
  },
  autoMockOff() {
    return jest.disableAutomock();
  },
  deepUnmock(specifier) {
    return deepUnmockModule(specifier, activeModulePath, jest);
  },
  unstable_mockModule(specifier, factory) {
    return registerEsmModuleMock(specifier, factory, activeModulePath, jest);
  },
  unstable_unmockModule(specifier) {
    return unregisterEsmModuleMock(specifier, activeModulePath, jest);
  },
  resetModules() {
    const isolation = jest._isolatedModuleCache;
    if (isolation?.active) {
      resetModuleIsolation(isolation);
      jest._isolatedModuleCache = undefined;
    } else {
      clearCommonJsModuleCache();
      resetCommonJsMockEntries();
      resetEsmModules();
    }
    return jest;
  },
  isolateModules(callback) {
    if (typeof callback !== 'function') {
      throw new TypeError('jest.isolateModules expects a callback function');
    }
    if (jest._isolatedModuleCache) {
      throw new Error(
        'isolateModules cannot be nested inside another isolateModules or isolateModulesAsync.',
      );
    }
    const isolation = beginModuleIsolation();
    jest._isolatedModuleCache = isolation;
    try {
      callback();
    } finally {
      endModuleIsolation(isolation);
      if (jest._isolatedModuleCache === isolation) {
        jest._isolatedModuleCache = undefined;
      }
    }
    return jest;
  },
  async isolateModulesAsync(callback) {
    if (typeof callback !== 'function') {
      throw new TypeError('jest.isolateModulesAsync expects a callback function');
    }
    if (jest._isolatedModuleCache) {
      throw new Error(
        'isolateModulesAsync cannot be nested inside another isolateModulesAsync or isolateModules.',
      );
    }
    const isolation = beginModuleIsolation();
    jest._isolatedModuleCache = isolation;
    try {
      await callback();
    } finally {
      endModuleIsolation(isolation);
      if (jest._isolatedModuleCache === isolation) {
        jest._isolatedModuleCache = undefined;
      }
    }
  },
  useFakeTimers: installFakeTimers,
  useRealTimers: restoreRealTimers,
  runAllTicks,
  runAllImmediates: runAllLegacyImmediates,
  runAllTimers() {
    assertFakeTimers();
    if (fakeTimers.mode === 'legacy') {
      runAllTicks();
      runAllLegacyImmediates();
    }
    let runs = 0;
    let timer;
    while ((timer = nextFakeTimer())) {
      if (++runs > fakeTimers.maxRuns) {
        throw new Error(
          `Aborting after running ${fakeTimers.maxRuns} timers, assuming an infinite loop`,
        );
      }
      runTimer(timer);
      if (fakeTimers.mode === 'legacy') {
        if (fakeTimers.immediates.length > 0) runAllLegacyImmediates();
        if (fakeTimers.ticks.length > 0) runAllTicks();
      }
    }
    if (fakeTimers.mode !== 'legacy') runAllTicks();
    return jest;
  },
  async runAllTimersAsync() {
    assertFakeTimers();
    if (fakeTimers.mode === 'legacy') {
      throw new TypeError(
        '`jest.runAllTimersAsync()` is not available when using legacy fake timers.',
      );
    }
    let runs = 0;
    let timer;
    while ((timer = nextFakeTimer())) {
      if (++runs > fakeTimers.maxRuns) {
        throw new Error(
          `Aborting after running ${fakeTimers.maxRuns} timers, assuming an infinite loop`,
        );
      }
      runTimer(timer);
      await Promise.resolve();
    }
    runAllTicks();
    return jest;
  },
  runOnlyPendingTimers() {
    assertFakeTimers();
    const pending = [...fakeTimers.timers.values()].sort(
      (left, right) => left.callAt - right.callAt || left.id - right.id,
    );
    if (fakeTimers.mode === 'legacy') {
      for (const immediate of [...fakeTimers.immediates]) {
        runLegacyImmediate(immediate);
      }
      for (const timer of pending) {
        if (fakeTimers.timers.get(timer.id) !== timer) continue;
        fakeTimers.monotonicNow += timer.callAt - fakeTimers.now;
        fakeTimers.now = timer.callAt;
        runTimer(timer);
      }
      return jest;
    }
    for (const timer of pending) {
      if (fakeTimers.timers.get(timer.id) === timer) runTimer(timer);
    }
    return jest;
  },
  async runOnlyPendingTimersAsync() {
    assertFakeTimers();
    if (fakeTimers.mode === 'legacy') {
      throw new TypeError(
        '`jest.runOnlyPendingTimersAsync()` is not available when using legacy fake timers.',
      );
    }
    const pending = [...fakeTimers.timers.values()].sort(
      (left, right) => left.callAt - right.callAt || left.id - right.id,
    );
    for (const timer of pending) {
      if (fakeTimers.timers.get(timer.id) === timer) {
        runTimer(timer);
        await Promise.resolve();
      }
    }
    return jest;
  },
  advanceTimersByTime(milliseconds) {
    assertFakeTimers();
    const duration = timerAdvanceDuration(milliseconds);
    runTimersUntil(fakeTimers.now + duration);
    return jest;
  },
  advanceTimersToNextFrame() {
    assertFakeTimers();
    if (fakeTimers.mode === 'legacy') {
      throw new TypeError(
        '`jest.advanceTimersToNextFrame()` is not available when using legacy fake timers.',
      );
    }
    runTimersUntil(fakeTimers.now + timeToNextFrame());
    return jest;
  },
  async advanceTimersByTimeAsync(milliseconds) {
    assertFakeTimers();
    if (fakeTimers.mode === 'legacy') {
      throw new TypeError(
        '`jest.advanceTimersByTimeAsync()` is not available when using legacy fake timers.',
      );
    }
    const duration = timerDelay(milliseconds);
    await runTimersUntilAsync(fakeTimers.now + duration);
    return jest;
  },
  advanceTimersToNextTimer(steps = 1) {
    assertFakeTimers();
    for (let index = 0; index < Number(steps); index += 1) {
      const timer = nextFakeTimer();
      if (!timer) break;
      runTimersUntil(timer.callAt);
    }
    return jest;
  },
  async advanceTimersToNextTimerAsync(steps = 1) {
    assertFakeTimers();
    if (fakeTimers.mode === 'legacy') {
      throw new TypeError(
        '`jest.advanceTimersToNextTimerAsync()` is not available when using legacy fake timers.',
      );
    }
    for (let index = 0; index < Number(steps); index += 1) {
      const timer = nextFakeTimer();
      if (!timer) break;
      await runTimersUntilAsync(timer.callAt);
    }
    return jest;
  },
  clearAllTimers() {
    assertFakeTimers();
    fakeTimers.timers.clear();
    fakeTimers.immediates.length = 0;
    if (fakeTimers.mode !== 'legacy') fakeTimers.ticks.length = 0;
    return jest;
  },
  getTimerCount() {
    assertFakeTimers();
    return (
      fakeTimers.timers.size +
      fakeTimers.ticks.length +
      fakeTimers.immediates.length
    );
  },
  setSystemTime(value) {
    assertFakeTimers();
    if (fakeTimers.mode === 'legacy') {
      throw new TypeError(
        '`jest.setSystemTime()` is not available when using legacy fake timers.',
      );
    }
    const next = new NativeDate(value ?? NativeDate.now()).getTime();
    const difference = next - fakeTimers.now;
    fakeTimers.now = next;
    for (const timer of fakeTimers.timers.values()) {
      timer.callAt += difference;
    }
    return jest;
  },
  now() {
    return fakeTimers.active ? fakeTimers.now : NativeDate.now();
  },
  getRealSystemTime() {
    if (fakeTimers.mode === 'legacy') {
      throw new TypeError(
        '`jest.getRealSystemTime()` is not available when using legacy fake timers.',
      );
    }
    return NativeDate.now();
  },
  getSeed() {
    return request.seed;
  },
  clearAllMocks() {
    forEachRegisteredMock(mock => mock.mockClear());
    return jest;
  },
  resetAllMocks() {
    forEachRegisteredMock(mock => mock.mockReset());
    return jest;
  },
  restoreAllMocks() {
    for (const restore of restoreRegistry) restore();
    restoreRegistry.clear();
    return jest;
  },
  setTimeout(value) {
    defaultTimeout = Number(value);
    return jest;
  },
  retryTimes(numTestRetries, options) {
    return setRetryTimes(numTestRetries, options, jest);
  },
};
globalThis.jest = jest;

function setRetryTimes(numTestRetries, options, receiver) {
  if (options?.entireDescribe) {
    if (definitionComplete) {
      throw new Error(
        'Cannot set retry options after tests have started running. Retry options must be set synchronously.',
      );
    }
    currentSuite.retryOptions = {
      attempts: numTestRetries,
      logErrors: options.logErrorsBeforeRetry,
      wait: options.waitBeforeRetry,
    };
    return receiver;
  }
  configuredRetryTimes = numTestRetries;
  configuredLogErrorsBeforeRetry = options?.logErrorsBeforeRetry;
  configuredRetryWait = options?.waitBeforeRetry;
  configuredRetryImmediately = options?.retryImmediately;
  return receiver;
}

function currentRetryOptions() {
  return {
    attempts: Number.parseInt(configuredRetryTimes, 10) || 0,
    immediately: Boolean(configuredRetryImmediately),
    logErrors: Boolean(configuredLogErrorsBeforeRetry),
    wait: Number.parseInt(configuredRetryWait, 10) || 0,
  };
}

function fullName(node) {
  const names = [node.name];
  let suite = node.parent;
  while (suite?.parent) {
    names.push(suite.name);
    suite = suite.parent;
  }
  names.reverse();
  // Jest 29's legacy result adapter omitted an empty test title, while Jest 30
  // preserves the separator in `fullName`. Follow the project's installed
  // Jest major when it is available, defaulting to current Jest semantics.
  if (installedJestMajorVersion < 30 && names.at(-1) === '') names.pop();
  return names.join(' ');
}

function hasOnly(node, inherited = false) {
  const focused = inherited || node.mode === 'only';
  if (node.type === 'test') return focused;
  return node.children.some(child => hasOnly(child, focused));
}

function hasRunnable(
  node,
  focusExists,
  inheritedOnly = false,
  inheritedSkip = false,
) {
  const selected = inheritedOnly || node.mode === 'only';
  const skipped = inheritedSkip || node.mode === 'skip';
  if (node.type === 'test') {
    return (
      !skipped &&
      node.mode !== 'todo' &&
      (!focusExists || selected) &&
      matchesName(node)
    );
  }
  return node.children.some(child =>
    hasRunnable(child, focusExists, selected, skipped),
  );
}

function matchesName(testNode) {
  return (
    !request.testNamePattern ||
    new RegExp(request.testNamePattern, 'i').test(fullName(testNode))
  );
}

function errorText(error) {
  if (error instanceof Error) {
    return error.stack || `${error.name}: ${error.message}`;
  }
  return `Thrown: ${printable(error)}`;
}

async function callAsync(callback, timeout, label) {
  const timeoutMs = Number(timeout ?? defaultTimeout);
  let timer;
  const work =
    callback.length > 0
      ? new Promise((resolve, reject) => {
          let done = false;
          const finish = error => {
            if (done) {
              reject(new Error(`Expected done to be called once in ${label}`));
              return;
            }
            done = true;
            if (error) reject(error);
            else resolve();
          };
          try {
            const returned = callback(finish);
            if (returned !== undefined) {
              reject(
                new Error(
                  `Test functions cannot both take a done callback and return a value in ${label}`,
                ),
              );
            }
          } catch (error) {
            reject(error);
          }
        })
      : Promise.resolve().then(() => callback());
  try {
    return await Promise.race([
      work,
      new Promise((_, reject) => {
        timer = nativeSetTimeout(
          () =>
            reject(
              new Error(`Exceeded timeout of ${timeoutMs} ms for ${label}`),
            ),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    nativeClearTimeout(timer);
  }
}

async function callEnvironmentHook(hook, label, context = {}) {
  await dispatchCustomEnvironmentEvent({hook, name: 'hook_start'});
  try {
    await callAsync(hook.callback, hook.timeout, label);
    await dispatchCustomEnvironmentEvent({
      ...context,
      hook,
      name: 'hook_success',
    });
  } catch (error) {
    await dispatchCustomEnvironmentEvent({
      ...context,
      error,
      hook,
      name: 'hook_failure',
    });
    throw error;
  }
}

function hookChain(testNode, type) {
  const suites = [];
  for (let suite = testNode.parent; suite; suite = suite.parent) {
    suites.push(suite);
  }
  if (type === 'beforeEach') suites.reverse();
  return suites.flatMap(suite => suite.hooks[type]);
}

function skippedResults(node, status = 'skipped') {
  if (node.type === 'test') {
    markSnapshotsChecked(fullName(node));
    const result = {
        name: node.name,
        fullName: fullName(node),
        status: node.mode === 'todo' ? 'todo' : status,
        durationMs: 0,
        failureMessage: null,
        invocations: 0,
        retryReasons: [],
      };
    result[RESULT_TEST_NODE] = node;
    return [result];
  }
  return node.children.flatMap(child => skippedResults(child, status));
}

async function runTest(
  node,
  focusExists,
  selected,
  skipped,
  beforeAllError,
) {
  const result = {
    name: node.name,
    fullName: fullName(node),
    status: 'passed',
    durationMs: 0,
    failureMessage: null,
    invocations: node.invocations ?? 0,
    retryReasons: [...(node.retryReasons ?? [])],
  };
  result[RESULT_TEST_NODE] = node;
  await dispatchCustomEnvironmentEvent({name: 'test_start', test: node});
  const isSelected = selected || node.mode === 'only';
  if (node.mode === 'todo') {
    markSnapshotsChecked(result.fullName);
    result.status = 'todo';
    await dispatchCustomEnvironmentEvent({name: 'test_todo', test: node});
    return result;
  }
  if (
    skipped ||
    node.mode === 'skip' ||
    (focusExists && !isSelected) ||
    !matchesName(node)
  ) {
    markSnapshotsChecked(result.fullName);
    result.status = 'skipped';
    await dispatchCustomEnvironmentEvent({name: 'test_skip', test: node});
    return result;
  }
  activeTest = node;
  await dispatchCustomEnvironmentEvent({name: 'test_started', test: node});
  node.invocations = (node.invocations ?? 0) + 1;
  result.invocations = node.invocations;
  node.assertionCalls = 0;
  node.expectedAssertions = undefined;
  node.requiresAssertions = false;
  expectState.assertionCalls = 0;
  expectState.currentTestName = result.fullName;
  expectState.expectedAssertionsNumber = null;
  expectState.isExpectingAssertions = false;
  expectState.numPassingAsserts = 0;
  expectState.suppressedErrors = [];
  const testStarted = performance.now();
  const failures = beforeAllError ? [beforeAllError] : [];
  if (!beforeAllError) {
    if (request.resetModules) jest.resetModules();
    if (request.clearMocks) jest.clearAllMocks();
    if (request.resetMocks) {
      jest.resetAllMocks();
      if (
        request.fakeTimers?.enableGlobally &&
        request.fakeTimers?.legacyFakeTimers
      ) {
        installFakeTimers(request.fakeTimers);
      }
    }
    if (request.restoreMocks) jest.restoreAllMocks();
    for (const hook of hookChain(node, 'beforeEach')) {
      try {
        await callEnvironmentHook(hook, 'beforeEach hook', {test: node});
      } catch (error) {
        failures.push(error);
        break;
      }
    }
    if (failures.length === 0) {
      await dispatchCustomEnvironmentEvent({name: 'test_fn_start', test: node});
      try {
        await callAsync(
          node.callback,
          node.timeout,
          `test "${result.fullName}"`,
        );
        await dispatchCustomEnvironmentEvent({
          name: 'test_fn_success',
          test: node,
        });
      } catch (error) {
        failures.push(error);
        await dispatchCustomEnvironmentEvent({
          error,
          name: 'test_fn_failure',
          test: node,
        });
      }
    }
    for (const hook of hookChain(node, 'afterEach')) {
      try {
        await callEnvironmentHook(hook, 'afterEach hook', {test: node});
      } catch (error) {
        failures.push(error);
      }
    }
    if (
      node.expectedAssertions !== undefined &&
      node.assertionCalls !== node.expectedAssertions
    ) {
      failures.push(
        new RjestAssertionError(
          `Expected ${node.expectedAssertions} assertion${node.expectedAssertions === 1 ? '' : 's'} to be called but received ${node.assertionCalls}.`,
        ),
      );
    }
    if (node.requiresAssertions && node.assertionCalls === 0) {
      failures.push(
        new RjestAssertionError(
          'Expected at least one assertion to be called but received none.',
        ),
      );
    }
  }
  result.durationMs = Math.max(
    0,
    Math.round(performance.now() - testStarted),
  );
  if (failures.length > 0) {
    result.status = 'failed';
    result.failureMessage = failures.map(errorText).join('\n\n');
  }
  result.retryReasons = [...(node.retryReasons ?? [])];
  await dispatchCustomEnvironmentEvent({name: 'test_done', test: node});
  activeTest = undefined;
  return result;
}

async function retryTest(
  node,
  initialResult,
  retryOptions,
  focusExists,
  selected,
  skipped,
) {
  let result = initialResult;
  let retriesRemaining = retryOptions.attempts;
  while (retriesRemaining > 0 && result.status === 'failed') {
    if (retryOptions.logErrors && result.failureMessage) {
      node.retryReasons.push(result.failureMessage);
    }
    clearSnapshotAttempt(node);
    if (retryOptions.wait > 0) {
      await new Promise(resolve => nativeSetTimeout(resolve, retryOptions.wait));
    }
    result = await runTest(node, focusExists, selected, skipped, undefined);
    retriesRemaining -= 1;
  }
  result.retryReasons = [...node.retryReasons];
  return result;
}

function testsUnderSuite(suite) {
  const tests = [];
  const pending = [suite];
  while (pending.length > 0) {
    const node = pending.pop();
    if (node.type === 'test') {
      tests.push(node);
      continue;
    }
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      pending.push(node.children[index]);
    }
  }
  return tests;
}

async function runSuite(
  suite,
  focusExists,
  inheritedOnly = false,
  inheritedSkip = false,
  inheritedBeforeAllError = undefined,
  insideDescribeRetry = false,
) {
  if (suite.retryOptions && !inheritedBeforeAllError) {
    let retriesRemaining =
      Number.parseInt(String(suite.retryOptions.attempts), 10) || 0;
    const retryTests = testsUnderSuite(suite);
    while (true) {
      const fileErrorStart = fileErrors.length;
      const processErrorsBeforeAttempt = processErrorGeneration;
      const results = await runSuiteOnce(
        suite,
        focusExists,
        inheritedOnly,
        inheritedSkip,
        inheritedBeforeAllError,
        true,
      );
      const hasTestErrors = results.some(result => result.status === 'failed');
      const hasFileErrors = fileErrors.length > fileErrorStart;
      const hasProcessErrors =
        processErrorGeneration > processErrorsBeforeAttempt;
      if (
        !hasTestErrors ||
        hasFileErrors ||
        hasProcessErrors ||
        retriesRemaining <= 0
      ) {
        return results;
      }
      if (suite.retryOptions.logErrors) {
        for (const [index, result] of results.entries()) {
          if (!result.failureMessage) continue;
          result[RESULT_TEST_NODE]?.retryReasons.push(result.failureMessage);
        }
      }
      fileErrors.splice(fileErrorStart);
      for (const test of retryTests) clearSnapshotAttempt(test);
      const wait = Number.parseInt(String(suite.retryOptions.wait), 10) || 0;
      if (wait > 0) {
        await new Promise(resolve => nativeSetTimeout(resolve, wait));
      }
      retriesRemaining -= 1;
    }
  }
  return runSuiteOnce(
    suite,
    focusExists,
    inheritedOnly,
    inheritedSkip,
    inheritedBeforeAllError,
    insideDescribeRetry,
  );
}

async function runSuiteOnce(
  suite,
  focusExists,
  inheritedOnly,
  inheritedSkip,
  inheritedBeforeAllError,
  insideDescribeRetry,
) {
  const results = [];
  const deferredRetries = [];
  const retryOptions = currentRetryOptions();
  const selected = inheritedOnly || suite.mode === 'only';
  const skipped = inheritedSkip || suite.mode === 'skip';
  if (randomGenerator && !suite.shuffled) {
    shuffleInPlace(suite.children, randomGenerator);
    suite.shuffled = true;
  }
  if (skipped) return skippedResults(suite);
  if (!hasRunnable(suite, focusExists, selected, skipped)) {
    return skippedResults(suite);
  }
  await dispatchCustomEnvironmentEvent({
    describeBlock: suite,
    name: 'run_describe_start',
  });
  let beforeAllError = inheritedBeforeAllError;
  if (!beforeAllError) {
    for (const hook of suite.hooks.beforeAll) {
      try {
        await callEnvironmentHook(hook, 'beforeAll hook', {
          describeBlock: suite,
        });
      } catch (error) {
        beforeAllError = error;
        break;
      }
    }
  }
  for (const child of suite.children) {
    if (child.type === 'suite') {
      results.push(
        ...(await runSuite(
          child,
          focusExists,
          selected,
          skipped,
          beforeAllError,
          insideDescribeRetry,
        )),
      );
    } else {
      const resultIndex = results.length;
      let result = await runTest(
        child,
        focusExists,
        selected,
        skipped,
        beforeAllError,
      );
      results.push(result);
      const shouldRetry =
        !insideDescribeRetry &&
        !beforeAllError &&
        retryOptions.attempts > 0 &&
        result.status === 'failed';
      if (shouldRetry && retryOptions.immediately) {
        result = await retryTest(
          child,
          result,
          retryOptions,
          focusExists,
          selected,
          skipped,
        );
        results[resultIndex] = result;
      } else if (shouldRetry) {
        deferredRetries.push({node: child, result, resultIndex});
      }
    }
  }
  for (const deferred of deferredRetries) {
    results[deferred.resultIndex] = await retryTest(
      deferred.node,
      deferred.result,
      retryOptions,
      focusExists,
      selected,
      skipped,
    );
  }
  for (const hook of suite.hooks.afterAll) {
    try {
      await callEnvironmentHook(hook, 'afterAll hook', {
        describeBlock: suite,
      });
    } catch (error) {
      fileErrors.push(errorText(error));
    }
  }
  await dispatchCustomEnvironmentEvent({
    describeBlock: suite,
    name: 'run_describe_finish',
  });
  return results;
}

process.on('unhandledRejection', error => {
  processErrorGeneration += 1;
  fileErrors.push(errorText(error));
});
process.on('uncaughtException', error => {
  processErrorGeneration += 1;
  fileErrors.push(errorText(error));
});

let tests = [];
try {
  configureFileEnvironment();
  await configureCustomTestEnvironment();
  await configureCustomResolver();
  await configureTransforms();
  installJsdomEnvironment();
  if (jsdomEnvironment) {
    // Let JSDOM finish its initial ready-state and load events before user code
    // can mock shared Node globals such as Date. Jest runs JSDOM in a separate
    // VM realm, so those internal events cannot observe test-side global mocks.
    await new Promise(resolve => nativeSetImmediate(resolve));
  }
  configureSnapshotFormat();
  configureEsmRuntime();
  automockEnabled = Boolean(request.automock);
  const frameworkGlobals = [
    'afterAll',
    'afterEach',
    'beforeAll',
    'beforeEach',
    'describe',
    'expect',
    'fdescribe',
    'fit',
    'it',
    'test',
    'xdescribe',
    'xit',
    'xtest',
  ];
  const savedFrameworkGlobals = new Map(
    frameworkGlobals.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
  );
  try {
    for (const name of frameworkGlobals) delete globalThis[name];
    for (const setupPath of request.setupFiles ?? []) {
      await loadRuntimeModule(setupPath);
    }
  } finally {
    for (const [name, descriptor] of savedFrameworkGlobals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    }
  }
  await setupCustomTestEnvironment();
  const runtimeGlobals = {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    fdescribe: describe.only,
    fit: test.only,
    it,
    jest,
    test,
    xdescribe: describe.skip,
    xit: test.skip,
    xtest: test.skip,
  };
  if (customTestEnvironment) {
    Object.assign(customTestEnvironment.global, runtimeGlobals);
    projectCustomEnvironmentGlobals();
  }
  await dispatchCustomEnvironmentEvent({
    name: 'setup',
    parentProcess: process,
    runtimeGlobals,
    testNamePattern: request.testNamePattern,
  });
  if (request.fakeTimers?.enableGlobally) {
    installFakeTimers(request.fakeTimers);
  }
  // jest-circus registers its mock/reset/restore lifecycle as the first root
  // beforeEach hook. Rjest performs those operations at the same boundary in
  // runTest, while this no-op hook preserves the observable custom-environment
  // event stream and ordering before user hooks.
  defineHook('beforeEach', () => {});
  for (const setupPath of request.setupFilesAfterEnv ?? []) {
    await loadRuntimeModule(setupPath);
  }
  await loadRuntimeModule(request.testPath);
  definitionComplete = true;
  await dispatchCustomEnvironmentEvent({name: 'run_start'});
  tests = await runSuite(rootSuite, hasOnly(rootSuite));
  await dispatchCustomEnvironmentEvent({name: 'run_finish'});
  await Promise.resolve();
  await collectUncoveredCoverage();
} catch (error) {
  fileErrors.push(errorText(error));
}

if (snapshotState.inlineUpdates.length > 0) {
  try {
    await persistInlineSnapshots();
  } catch (error) {
    fileErrors.push(errorText(error));
  }
}

if (
  definitionComplete &&
  snapshotState.update === 'all' &&
  snapshotState.unchecked.size > 0
) {
  for (const key of snapshotState.unchecked) delete snapshotState.data[key];
  snapshotState.removed = snapshotState.unchecked.size;
  snapshotState.unchecked.clear();
  snapshotState.dirty = true;
} else if (definitionComplete && snapshotState.unchecked.size > 0) {
  fileErrors.push(
    `${snapshotState.unchecked.size} obsolete snapshot${snapshotState.unchecked.size === 1 ? '' : 's'} found. Run with --updateSnapshot to remove ${snapshotState.unchecked.size === 1 ? 'it' : 'them'}.\n` +
      [...snapshotState.unchecked].map(key => `  - ${key}`).join('\n'),
  );
}

let coverage = {};
try {
  coverage = await collectedCoverage();
} catch (error) {
  fileErrors.push(errorText(error));
}

if (fakeTimers.active) restoreRealTimers();
try {
  await teardownCustomTestEnvironment();
} catch (error) {
  fileErrors.push(errorText(error));
}

const result = {
  protocolVersion: PROTOCOL_VERSION,
  testPath: request.testPath,
  tests,
  errors: fileErrors,
  console: consoleEntries,
  durationMs: Math.max(0, Math.round(performance.now() - started)),
  heapUsedBytes: process.memoryUsage().heapUsed,
  snapshot: {
    added: snapshotState.added,
    matched: snapshotState.matched,
    unmatched: snapshotState.unmatched,
    updated: snapshotState.updated,
    removed: snapshotState.removed,
    uncheckedKeys: [...snapshotState.unchecked],
    dirty: snapshotState.dirty,
    data: snapshotState.data,
  },
  coverage,
};
jsdomEnvironment?.window.close();
process.stdout.write(`${RESULT_PREFIX}${JSON.stringify(result)}\n`, () => {
  process.exit(0);
});
