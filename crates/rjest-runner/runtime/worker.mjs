import {existsSync, readFileSync} from 'node:fs';
import Module, {createRequire, registerHooks} from 'node:module';
import {isDeepStrictEqual, format, inspect, promisify} from 'node:util';
import {
  basename,
  dirname,
  extname,
  join,
  resolve as resolvePath,
} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';

const PROTOCOL_VERSION = 10;
const RESULT_PREFIX = '__RJEST_RESULT__';
const ASYMMETRIC = Symbol.for('rjest.asymmetricMatcher');
const nativeSetTimeout = globalThis.setTimeout;
const nativeClearTimeout = globalThis.clearTimeout;
const nativeSetInterval = globalThis.setInterval;
const nativeClearInterval = globalThis.clearInterval;
const nativeSetImmediate = globalThis.setImmediate;
const nativeClearImmediate = globalThis.clearImmediate;
const nativeQueueMicrotask = globalThis.queueMicrotask;
const NativeDate = globalThis.Date;
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
const esmMockValues = new Map();
const bypassModuleMocks = new Set();
const explicitlyUnmockedModules = new Set();
const originalModuleExtensions = new Map(Object.entries(Module._extensions));
const runtimeTransformers = [];
const transformCacheFs = new Map();
const transformedSourceCache = new Map();
const instrumentedFiles = new Set();
const runtimeSnapshotSerializers = [];
let runtimePrettyFormatter;
let runtimePrettyFormatPlugins = [];
let runtimePrettyFormatSupportsBasicPrototype = false;
let jsdomEnvironment;
let nativeWindowTimers;
let nativeAnimationFrame;
let transformerDepth = 0;
let automockEnabled = false;
let esmHooksInstalled = false;
let nextEsmMockId = 1;

if (request.protocolVersion !== PROTOCOL_VERSION) {
  throw new Error(`Unsupported Rjest worker protocol ${request.protocolVersion}`);
}

const started = performance.now();
const consoleEntries = [];
const fileErrors = [];
const mockRegistry = new Set();
const restoreRegistry = new Set();
const customMatchers = new Map();
let invocationOrder = 0;
let defaultTimeout = request.defaultTimeoutMs;
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

const rootSuite = makeSuite('', null, undefined);
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
  };
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
  const suite = makeSuite(String(name), currentSuite, mode);
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
    currentSuite = previous;
  }
}

function defineTest(name, callback, mode, timeout, concurrent = false) {
  assertCanDefine('test');
  if (mode !== 'todo' && typeof callback !== 'function') {
    throw new TypeError('test expects a callback function');
  }
  currentSuite.children.push({
    type: 'test',
    name: String(name),
    callback,
    mode,
    timeout,
    concurrent,
    parent: currentSuite,
  });
}

function defineHook(type, callback, timeout) {
  assertCanDefine('hook');
  if (typeof callback !== 'function') {
    throw new TypeError(`${type} expects a callback function`);
  }
  currentSuite.hooks[type].push({callback, timeout});
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
  const count = (snapshotState.counts.get(normalizedName) ?? 0) + 1;
  snapshotState.counts.set(normalizedName, count);
  const key = `${normalizedName} ${count}`;
  snapshotState.unchecked.delete(key);
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
    snapshotState.matched += 1;
    snapshotState.data[key] = receivedSerialized;
    return {pass: true, key};
  }
  if (hasSnapshot && snapshotState.update === 'all') {
    snapshotState.updated += 1;
    snapshotState.dirty = true;
    snapshotState.data[key] = receivedSerialized;
    return {pass: true, key};
  }
  if (
    !hasSnapshot &&
    (snapshotState.update === 'new' || snapshotState.update === 'all')
  ) {
    snapshotState.added += 1;
    snapshotState.dirty = true;
    snapshotState.data[key] = receivedSerialized;
    return {pass: true, key};
  }

  snapshotState.unmatched += 1;
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
    const inlineSnapshot = stripInlineSnapshotIndentation(arguments_.at(-1));
    if (typeof inlineSnapshot !== 'string') {
      throw new Error(
        'Writing new inline snapshots is not supported yet; provide an existing inline snapshot',
      );
    }
    const evaluate = received => {
      const snapshotReceived = hasProperties
        ? applySnapshotProperties(received, properties)
        : received;
      const serialized = formatSnapshot(snapshotReceived);
      if (serialized !== inlineSnapshot) {
        snapshotState.unmatched += 1;
        throw new RjestAssertionError(
          `Inline snapshot mismatch\nExpected: ${inlineSnapshot}\nReceived: ${serialized}`,
        );
      }
      snapshotState.matched += 1;
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
    return makeExpectation(
      thrown?.message ?? String(thrown),
    ).toMatchInlineSnapshot(inlineSnapshot);
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

function requireFrom(path = activeModulePath) {
  return createRequire(path);
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
  return request.testPath;
}

function resolveEsmCandidate(specifier, parentURL) {
  const moduleName = String(specifier);
  if (Module.isBuiltin(moduleName)) {
    return moduleName.startsWith('node:') ? moduleName : `node:${moduleName}`;
  }
  try {
    const resolved = createRequire(esmParentPath(parentURL)).resolve(moduleName);
    if (Module.isBuiltin(resolved)) {
      return resolved.startsWith('node:') ? resolved : `node:${resolved}`;
    }
    return pathToFileURL(resolved).href;
  } catch {
    return undefined;
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

function registeredEsmMock(specifier, parentURL) {
  const moduleName = String(specifier);
  const direct = esmModuleMocks.find(entry => entry.specifier === moduleName);
  if (direct) return direct;
  if (!moduleName.startsWith('.') && !moduleName.startsWith('/')) return undefined;
  if (!esmModuleMocks.some(entry => entry.relative)) return undefined;
  const canonical = resolveEsmCandidate(moduleName, parentURL);
  return esmModuleMocks.find(
    entry => entry.relative && entry.canonical && entry.canonical === canonical,
  );
}

function esmDataUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
}

function initializeEsmMock(entry) {
  if (!entry.initialized) {
    const value = entry.factory();
    if (value && typeof value.then === 'function') {
      throw new Error(
        `Async jest.unstable_mockModule factories are not supported yet for ${entry.specifier}`,
      );
    }
    if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
      throw new TypeError(
        `jest.unstable_mockModule factory for ${entry.specifier} must return an object`,
      );
    }
    entry.value = value;
    entry.initialized = true;
    esmMockValues.set(entry.id, value);
  }
  return esmDataUrl(esmMockSource(entry));
}

function validEsmExportName(name) {
  return /^[A-Za-z_$][\w$]*$/.test(name) && name !== 'default';
}

function esmMockSource(entry) {
  const value = esmMockValues.get(entry.id);
  const lines = [
    `const value = globalThis[Symbol.for('rjest.esmRuntime')].mockValues.get(${entry.id});`,
  ];
  if (Object.prototype.hasOwnProperty.call(value, 'default')) {
    lines.push('export default value.default;');
  }
  for (const name of Object.keys(value).filter(validEsmExportName)) {
    lines.push(`export const ${name} = value[${JSON.stringify(name)}];`);
  }
  return lines.join('\n');
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
    mockValues: esmMockValues,
  };
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (transformerDepth > 0) return nextResolve(specifier, context);
      if (specifier === '@jest/globals') {
        return {shortCircuit: true, url: esmDataUrl(jestGlobalsSource())};
      }
      const mock = registeredEsmMock(specifier, context.parentURL);
      if (mock) {
        return {shortCircuit: true, url: initializeEsmMock(mock)};
      }
      const mapped = mappedEsmResolution(specifier, context.parentURL);
      if (mapped) return {shortCircuit: true, url: mapped};
      return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
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
          return {format: 'module', shortCircuit: true, source: transformed.code};
        }
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
  const candidates = mappedModuleCandidates(specifier);
  if (!candidates) {
    try {
      return Reflect.apply(originalModuleResolveFilename, this, [
        specifier,
        parent,
        isMain,
        options,
      ]);
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
      return Reflect.apply(originalModuleResolveFilename, this, [
        candidate,
        parent,
        isMain,
        options,
      ]);
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

function shouldAutomockModule(specifier, key) {
  if (transformerDepth > 0) return false;
  if (!automockEnabled || bypassModuleMocks.has(key)) return false;
  if (explicitlyUnmockedModules.has(key)) return false;
  if (Module.isBuiltin(String(specifier))) return false;
  const normalizedKey = normalizedRuntimePath(key);
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

function generateAutoMock(specifier, fromPath = activeModulePath) {
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
    return createAutoMock(loadActualModule(specifier, fromPath));
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

function registerEsmModuleMock(specifier, factory, fromPath, returnValue) {
  if (typeof factory !== 'function') {
    throw new TypeError('The second argument of jest.unstable_mockModule must be a function');
  }
  const moduleName = String(specifier);
  const parentURL = pathToFileURL(fromPath).href;
  const entry = {
    id: nextEsmMockId++,
    specifier: moduleName,
    canonical:
      mappedEsmResolution(moduleName, parentURL) ??
      resolveEsmCandidate(moduleName, parentURL),
    relative: moduleName.startsWith('.') || moduleName.startsWith('/'),
    factory,
    initialized: false,
    value: undefined,
  };
  const existing = esmModuleMocks.findIndex(candidate =>
    entry.relative
      ? candidate.canonical === entry.canonical
      : !candidate.relative && candidate.specifier === entry.specifier,
  );
  if (existing === -1) esmModuleMocks.push(entry);
  else esmModuleMocks[existing] = entry;
  return returnValue;
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
  if (!entry && shouldAutomockModule(specifier, key)) {
    entry = {
      factory: undefined,
      initialized: false,
      value: undefined,
      specifier: String(specifier),
      fromPath: parent?.filename ?? request.testPath,
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
      return unmockModule(specifier, fromPath, scoped);
    },
    unstable_mockModule(specifier, factory) {
      return registerEsmModuleMock(specifier, factory, fromPath, scoped);
    },
  });
  return scoped;
}

function transformerFromConfig(pattern, configured) {
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
    const loaded = requireFromTest(moduleName);
    const exported = loaded?.default ?? loaded;
    transformer =
      typeof exported?.createTransformer === 'function'
        ? exported.createTransformer(transformerConfig ?? {})
        : exported;
  } finally {
    transformerDepth -= 1;
    for (const path of Object.keys(Module._cache)) {
      if (!cachedBefore.has(path)) delete Module._cache[path];
    }
  }
  if (!transformer || typeof transformer.process !== 'function') {
    throw new TypeError(`Transformer ${moduleName} does not expose process()`);
  }
  return {
    pattern: new RegExp(pattern),
    transformer,
    transformerConfig: transformerConfig ?? {},
  };
}

function configureTransforms() {
  for (const [pattern, configured] of Object.entries(request.transform ?? {})) {
    runtimeTransformers.push(transformerFromConfig(pattern, configured));
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
      runtimeTransformers.push(transformerFromConfig('^.+\\.[jt]sx?$', babelJest));
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

function transformRuntimeSource(
  selected,
  source,
  filename,
  instrument,
  supportsStaticEsm = false,
) {
  const cacheKey = `${filename}\0${instrument ? 'coverage' : 'plain'}\0${supportsStaticEsm ? 'esm' : 'cjs'}`;
  const cached = transformedSourceCache.get(cacheKey);
  if (cached) return cached;
  const config = {
    cwd: request.rootDir,
    rootDir: request.rootDir,
    testEnvironment: effectiveTestEnvironment,
    moduleFileExtensions: request.moduleFileExtensions ?? [],
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
  let transformed;
  const cachedBeforeTransform = new Set(Object.keys(Module._cache));
  transformerDepth += 1;
  try {
    transformed =
      selected.transformer.process.length >= 4
        ? selected.transformer.process(source, filename, config, transformOptions)
        : selected.transformer.process(source, filename, transformOptions);
  } finally {
    transformerDepth -= 1;
    for (const path of Object.keys(Module._cache)) {
      if (!cachedBeforeTransform.has(path)) delete Module._cache[path];
    }
  }
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
      if (typeof instrumented?.code === 'string') code = instrumented.code;
    } finally {
      transformerDepth -= 1;
    }
  }
  if (instrument) {
    instrumentedFiles.add(normalizedRuntimePath(filename));
  }
  const result = {code};
  transformedSourceCache.set(cacheKey, result);
  return result;
}

function collectUncoveredCoverage() {
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
    const transformed = transformRuntimeSource(selected, source, filename, true);
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
  if (!String(effectiveTestEnvironment).includes('jsdom')) return;
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
    return import(`${pathToFileURL(path).href}?rjest=${Date.now()}`);
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
    mode === 'modern' && Number.isFinite(Number(options.timerLimit))
      ? Math.max(0, Math.floor(Number(options.timerLimit)))
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
  return jest;
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
    return unmockModule(specifier, activeModulePath, jest);
  },
  unstable_mockModule(specifier, factory) {
    return registerEsmModuleMock(specifier, factory, activeModulePath, jest);
  },
  resetModules() {
    for (const path of Object.keys(Module._cache)) {
      if (!path.includes('/node_modules/')) delete Module._cache[path];
    }
    return jest;
  },
  isolateModules(callback) {
    if (typeof callback !== 'function') {
      throw new TypeError('jest.isolateModules expects a callback function');
    }
    if (jest._isolatedModuleCache) {
      throw new Error('isolateModules cannot be nested inside another isolateModules');
    }
    const previousCache = Module._cache;
    const isolatedCache = Object.create(null);
    jest._isolatedModuleCache = isolatedCache;
    Module._cache = isolatedCache;
    try {
      callback();
    } finally {
      Module._cache = previousCache;
      jest._isolatedModuleCache = undefined;
    }
    return jest;
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
};
globalThis.jest = jest;

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
    return [
      {
        name: node.name,
        fullName: fullName(node),
        status: node.mode === 'todo' ? 'todo' : status,
        durationMs: 0,
        failureMessage: null,
      },
    ];
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
  };
  const isSelected = selected || node.mode === 'only';
  if (node.mode === 'todo') {
    markSnapshotsChecked(result.fullName);
    result.status = 'todo';
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
    return result;
  }
  activeTest = node;
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
    if (request.clearMocks) jest.clearAllMocks();
    for (const hook of hookChain(node, 'beforeEach')) {
      try {
        await callAsync(hook.callback, hook.timeout, 'beforeEach hook');
      } catch (error) {
        failures.push(error);
        break;
      }
    }
    if (failures.length === 0) {
      try {
        await callAsync(
          node.callback,
          node.timeout,
          `test "${result.fullName}"`,
        );
      } catch (error) {
        failures.push(error);
      }
    }
    for (const hook of hookChain(node, 'afterEach')) {
      try {
        await callAsync(hook.callback, hook.timeout, 'afterEach hook');
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
  activeTest = undefined;
  return result;
}

async function runSuite(
  suite,
  focusExists,
  inheritedOnly = false,
  inheritedSkip = false,
  inheritedBeforeAllError = undefined,
) {
  const results = [];
  const selected = inheritedOnly || suite.mode === 'only';
  const skipped = inheritedSkip || suite.mode === 'skip';
  if (skipped) return skippedResults(suite);
  if (!hasRunnable(suite, focusExists, selected, skipped)) {
    return skippedResults(suite);
  }
  let beforeAllError = inheritedBeforeAllError;
  if (!beforeAllError) {
    for (const hook of suite.hooks.beforeAll) {
      try {
        await callAsync(hook.callback, hook.timeout, 'beforeAll hook');
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
        )),
      );
    } else {
      results.push(
        await runTest(child, focusExists, selected, skipped, beforeAllError),
      );
    }
  }
  for (const hook of suite.hooks.afterAll) {
    try {
      await callAsync(hook.callback, hook.timeout, 'afterAll hook');
    } catch (error) {
      fileErrors.push(errorText(error));
    }
  }
  return results;
}

process.on('unhandledRejection', error => fileErrors.push(errorText(error)));
process.on('uncaughtException', error => fileErrors.push(errorText(error)));

let tests = [];
try {
  configureFileEnvironment();
  configureTransforms();
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
  if (request.fakeTimers?.enableGlobally) {
    installFakeTimers(request.fakeTimers);
  }
  for (const setupPath of request.setupFilesAfterEnv ?? []) {
    await loadRuntimeModule(setupPath);
  }
  await loadRuntimeModule(request.testPath);
  definitionComplete = true;
  tests = await runSuite(rootSuite, hasOnly(rootSuite));
  await Promise.resolve();
  collectUncoveredCoverage();
} catch (error) {
  fileErrors.push(errorText(error));
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
if (fakeTimers.active) restoreRealTimers();
jsdomEnvironment?.window.close();
process.stdout.write(`${RESULT_PREFIX}${JSON.stringify(result)}\n`, () => {
  process.exit(0);
});
