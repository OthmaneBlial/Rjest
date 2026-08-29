import {readFileSync} from 'node:fs';
import Module, {createRequire} from 'node:module';
import {isDeepStrictEqual, format, inspect} from 'node:util';
import {resolve as resolvePath} from 'node:path';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';

const PROTOCOL_VERSION = 5;
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
const originalModuleLoad = Module._load;
const originalModuleResolveFilename = Module._resolveFilename;
const moduleMocks = new Map();
const bypassModuleMocks = new Set();
const originalModuleExtensions = new Map(Object.entries(Module._extensions));
const runtimeTransformers = [];
const instrumentedFiles = new Set();
const runtimeSnapshotSerializers = [];
let runtimePrettyFormatter;
let runtimePrettyFormatPlugins = [];
let runtimePrettyFormatSupportsBasicPrototype = false;
let jsdomEnvironment;
let nativeWindowTimers;
let nativeAnimationFrame;
let transformerDepth = 0;

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
  let valueIndex = 0;
  return String(name).replace(/%[#sdifjo]/g, token => {
    if (token === '%#') return String(index);
    const value = values[valueIndex++];
    return token === '%j' ? JSON.stringify(value) : String(value);
  });
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

function subsetEqual(received, expected) {
  if (isAsymmetric(expected)) return expected.asymmetricMatch(received);
  if (typeof expected !== 'object' || expected === null) {
    return deepEqual(received, expected);
  }
  if (typeof received !== 'object' || received === null) return false;
  return Reflect.ownKeys(expected).every(
    key =>
      Object.prototype.hasOwnProperty.call(received, key) &&
      subsetEqual(received[key], expected[key]),
  );
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

function formatSnapshot(value) {
  const formatterOptions = {
    escapeRegex: true,
    plugins: [...runtimeSnapshotSerializers, ...runtimePrettyFormatPlugins],
    printFunctionName: true,
  };
  if (runtimePrettyFormatSupportsBasicPrototype) {
    formatterOptions.printBasicPrototype = false;
  }
  const serialized = runtimePrettyFormatter
    ? runtimePrettyFormatter(value, formatterOptions)
    : prettyFormat(value);
  return serialized.includes('\n') ? `\n${serialized}\n` : serialized;
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

  if (hasSnapshot && expected === receivedSerialized) {
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
    if (typeof expected === 'function') return thrown instanceof expected;
    if (expected instanceof Error) return thrown?.message === expected.message;
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
      const evaluate = received => {
        const args =
          name === 'toHaveProperty'
            ? [...expected, expected.length > 1]
            : expected;
        const matcherReceived =
          promiseMode === 'rejects' && name === 'toThrow'
            ? () => {
                throw received;
              }
            : received;
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
    const inlineSnapshot = arguments_.at(-1);
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

function createMock(implementation) {
  let defaultImplementation = implementation;
  const once = [];
  let name = 'jest.fn()';
  let restore;
  let state = newMockState();
  function mock(...args) {
    const context = this;
    state.calls.push(args);
    state.contexts.push(context);
    state.instances.push(new.target ? context : undefined);
    state.invocationCallOrder.push(++invocationOrder);
    state.lastCall = args;
    const result = {type: 'incomplete', value: undefined};
    state.results.push(result);
    const selected = once.length > 0 ? once.shift() : defaultImplementation;
    try {
      const value = selected ? selected.apply(context, args) : undefined;
      result.type = 'return';
      result.value = value;
      return value;
    } catch (error) {
      result.type = 'throw';
      result.value = error;
      throw error;
    }
  }
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
    restore?.();
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
  mockRegistry.add(mock);
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

  if (!descriptor || typeof descriptor.value !== 'function') {
    throw new TypeError(`Property ${String(property)} is not a function`);
  }
  const original = descriptor.value;
  if (isMock(original)) return original;
  const mock = createMock(function invokeOriginal(...args) {
    return original.apply(this, args);
  });
  Object.defineProperty(target, property, {...descriptor, value: mock});
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
    if (!expression.test(moduleName)) continue;
    return mapping.replacements.map(replacement =>
      moduleName.replace(expression, replacement),
    );
  }
  return undefined;
}

Module._resolveFilename = function rjestResolveFilename(
  specifier,
  parent,
  isMain,
  options,
) {
  const candidates = mappedModuleCandidates(specifier);
  if (!candidates) {
    return Reflect.apply(originalModuleResolveFilename, this, [
      specifier,
      parent,
      isMain,
      options,
    ]);
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

function resolveModuleKey(specifier, fromPath = activeModulePath) {
  return requireFrom(fromPath).resolve(String(specifier));
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

function createAutoMock(value, seen = new WeakMap()) {
  if (typeof value === 'function') {
    if (seen.has(value)) return seen.get(value);
    const mock = createMock();
    seen.set(value, mock);
    for (const key of Reflect.ownKeys(value)) {
      if (key === 'length' || key === 'name' || key === 'prototype') continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable) continue;
      mock[key] = createAutoMock(value[key], seen);
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
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable) continue;
    result[key] = createAutoMock(value[key], seen);
  }
  return result;
}

function registerModuleMock(
  specifier,
  factory,
  fromPath = activeModulePath,
  returnValue = jest,
) {
  const key = resolveModuleKey(specifier, fromPath);
  if (factory !== undefined && typeof factory !== 'function') {
    throw new TypeError('The second argument of jest.mock must be a function');
  }
  moduleMocks.set(key, {
    factory,
    initialized: false,
    value: undefined,
    specifier: String(specifier),
    fromPath,
  });
  delete Module._cache[key];
  return returnValue;
}

function requireMock(specifier, fromPath = activeModulePath) {
  const key = resolveModuleKey(specifier, fromPath);
  if (!moduleMocks.has(key)) registerModuleMock(specifier, undefined, fromPath);
  return requireFrom(fromPath)(specifier);
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
  let key;
  try {
    key = Module._resolveFilename(specifier, parent, isMain);
  } catch {
    return Reflect.apply(originalModuleLoad, this, [specifier, parent, isMain]);
  }
  const entry = moduleMocks.get(key);
  if (!entry || bypassModuleMocks.has(key)) {
    return Reflect.apply(originalModuleLoad, this, [specifier, parent, isMain]);
  }
  if (!entry.initialized) {
    entry.initialized = true;
    const previousModulePath = activeModulePath;
    activeModulePath = entry.fromPath;
    try {
      entry.value = entry.factory
        ? entry.factory()
        : createAutoMock(loadActualModule(entry.specifier, entry.fromPath));
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
    mock(specifier, factory) {
      return registerModuleMock(specifier, factory, fromPath, scoped);
    },
    doMock(specifier, factory) {
      return registerModuleMock(specifier, factory, fromPath, scoped);
    },
    unmock(specifier) {
      moduleMocks.delete(resolveModuleKey(specifier, fromPath));
      return scoped;
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
      return createAutoMock(loadActualModule(specifier, fromPath));
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
  const loaded = requireFromTest(moduleName);
  const exported = loaded?.default ?? loaded;
  const transformer =
    typeof exported?.createTransformer === 'function'
      ? exported.createTransformer(transformerConfig ?? {})
      : exported;
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
    (request.setupFilesAfterEnv ?? []).some(
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

function transformRuntimeSource(selected, source, filename, instrument) {
  const config = {
    cwd: request.rootDir,
    rootDir: request.rootDir,
    testEnvironment: request.testEnvironment,
    moduleFileExtensions: request.moduleFileExtensions ?? [],
  };
  const transformOptions = {
    cacheFS: new Map(),
    config,
    configString: JSON.stringify(config),
    instrument,
    rootDir: request.rootDir,
    supportsDynamicImport: false,
    supportsExportNamespaceFrom: false,
    supportsStaticESM: false,
    supportsTopLevelAwait: false,
    transformerConfig: selected.transformerConfig,
  };
  let transformed;
  transformerDepth += 1;
  try {
    transformed =
      selected.transformer.process.length >= 4
        ? selected.transformer.process(source, filename, config, transformOptions)
        : selected.transformer.process(source, filename, transformOptions);
  } finally {
    transformerDepth -= 1;
  }
  if (transformed && typeof transformed.then === 'function') {
    throw new Error(`Async transformer output is not supported for ${filename}`);
  }
  const code = typeof transformed === 'string' ? transformed : transformed?.code;
  if (typeof code !== 'string') {
    throw new TypeError(`Transformer returned no code for ${filename}`);
  }
  if (instrument) {
    instrumentedFiles.add(normalizedRuntimePath(filename));
  }
  return {code};
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

function collectedCoverage() {
  if (!request.collectCoverage) return {};
  return Object.fromEntries(
    Object.entries(globalThis.__coverage__ ?? {}).filter(([filename]) =>
      instrumentedFiles.has(normalizedRuntimePath(filename)),
    ),
  );
}

function installJsdomEnvironment() {
  if (!String(request.testEnvironment).includes('jsdom')) return;
  const {JSDOM} = requireFromTest('jsdom');
  const environmentOptions = request.testEnvironmentOptions ?? {};
  jsdomEnvironment = new JSDOM(
    '<!doctype html><html><head></head><body></body></html>',
    {
      pretendToBeVisual: true,
      url: environmentOptions.url ?? 'http://localhost/',
    },
  );
  const window = jsdomEnvironment.window;
  const protectedGlobals = new Set([
    'console',
    'global',
    'globalThis',
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
  ]);
  for (const key of Reflect.ownKeys(window)) {
    if (protectedGlobals.has(key)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(window, key);
    if (!descriptor) continue;
    const current = Object.getOwnPropertyDescriptor(globalThis, key);
    if (current && !current.configurable) continue;
    try {
      Object.defineProperty(globalThis, key, descriptor);
    } catch {
      // JSDOM exposes a few host properties that Node deliberately protects.
    }
  }
  for (const [key, value] of [
    ['window', window],
    ['self', window],
  ]) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      enumerable: true,
      value,
      writable: true,
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
    value: window.navigator,
    writable: true,
  });
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
  if (runtimeTransformerFor(path)) return requireFromTest(path);
  if (runtimeTransformers.length > 0 && !/\.(?:mjs|mts)$/.test(path)) {
    return requireFromTest(path);
  }
  return import(`${pathToFileURL(path).href}?rjest=${Date.now()}`);
}

const fakeTimers = {
  active: false,
  now: 0,
  monotonicNow: 0,
  nextId: 1,
  timers: new Map(),
  ticks: [],
  maxRuns: 100_000,
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

function timeToNextFrame() {
  return 16 - (fakeTimers.monotonicNow % 16);
}

function scheduleFakeTimer(type, callback, delay, args) {
  if (typeof callback !== 'function') {
    throw new TypeError(`${type} callback must be a function`);
  }
  const id = fakeTimers.nextId++;
  const duration = type === 'immediate' ? 0 : timerDelay(delay);
  fakeTimers.timers.set(id, {
    id,
    type,
    callback,
    args,
    callAt: fakeTimers.now + duration,
    interval: type === 'interval' ? Math.max(1, duration) : undefined,
  });
  return id;
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
    tick.callback(...tick.args);
  }
  return jest;
}

function runTimer(timer) {
  fakeTimers.timers.delete(timer.id);
  fakeTimers.monotonicNow += timer.callAt - fakeTimers.now;
  fakeTimers.now = timer.callAt;
  if (timer.type === 'interval') {
    timer.callAt += timer.interval;
    fakeTimers.timers.set(timer.id, timer);
  }
  timer.callback(...timer.args);
  runAllTicks();
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
  if (options === 'legacy' || options?.legacyFakeTimers) {
    throw new Error('Legacy fake timers are not supported yet');
  }
  if (fakeTimers.active) restoreRealTimers();
  fakeTimers.active = true;
  fakeTimers.now =
    options?.now === undefined
      ? NativeDate.now()
      : new NativeDate(options.now).getTime();
  fakeTimers.monotonicNow = 0;
  fakeTimers.nextId = 1;
  fakeTimers.timers.clear();
  fakeTimers.ticks.length = 0;
  nativeAnimationFrame = {
    request: globalThis.requestAnimationFrame,
    cancel: globalThis.cancelAnimationFrame,
  };
  const doNotFake = new Set(options?.doNotFake ?? []);
  if (!doNotFake.has('setTimeout')) {
    const fakeSetTimeout = (callback, delay, ...args) =>
      scheduleFakeTimer('timeout', callback, delay, args);
    fakeSetTimeout.clock = fakeTimers;
    const fakeClearTimeout = id => fakeTimers.timers.delete(Number(id));
    globalThis.setTimeout = fakeSetTimeout;
    globalThis.clearTimeout = fakeClearTimeout;
    if (jsdomEnvironment) {
      jsdomEnvironment.window.setTimeout = fakeSetTimeout;
      jsdomEnvironment.window.clearTimeout = fakeClearTimeout;
    }
  }
  if (!doNotFake.has('setInterval')) {
    const fakeSetInterval = (callback, delay, ...args) =>
      scheduleFakeTimer('interval', callback, delay, args);
    fakeSetInterval.clock = fakeTimers;
    const fakeClearInterval = id => fakeTimers.timers.delete(Number(id));
    globalThis.setInterval = fakeSetInterval;
    globalThis.clearInterval = fakeClearInterval;
    if (jsdomEnvironment) {
      jsdomEnvironment.window.setInterval = fakeSetInterval;
      jsdomEnvironment.window.clearInterval = fakeClearInterval;
    }
  }
  if (!doNotFake.has('setImmediate')) {
    globalThis.setImmediate = (callback, ...args) =>
      scheduleFakeTimer('immediate', callback, 0, args);
    globalThis.clearImmediate = id => fakeTimers.timers.delete(Number(id));
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
      fakeTimers.timers.delete(Number(id));
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
  fakeTimers.timers.clear();
  fakeTimers.ticks.length = 0;
  return jest;
}

const jest = {
  fn: createMock,
  spyOn,
  isMockFunction: isMock,
  mocked(value) {
    return value;
  },
  mock(specifier, factory) {
    return registerModuleMock(specifier, factory);
  },
  doMock(specifier, factory) {
    return registerModuleMock(specifier, factory);
  },
  unmock(specifier) {
    moduleMocks.delete(resolveModuleKey(specifier));
    return jest;
  },
  dontMock(specifier) {
    return jest.unmock(specifier);
  },
  requireActual: loadActualModule,
  requireMock,
  createMockFromModule(specifier) {
    return createAutoMock(loadActualModule(specifier));
  },
  resetModules() {
    for (const path of Object.keys(Module._cache)) {
      if (!path.includes('/node_modules/')) delete Module._cache[path];
    }
    return jest;
  },
  useFakeTimers: installFakeTimers,
  useRealTimers: restoreRealTimers,
  runAllTicks,
  runAllTimers() {
    assertFakeTimers();
    let runs = 0;
    let timer;
    while ((timer = nextFakeTimer())) {
      if (++runs > fakeTimers.maxRuns) {
        throw new Error(
          `Aborting after running ${fakeTimers.maxRuns} timers, assuming an infinite loop`,
        );
      }
      runTimer(timer);
    }
    runAllTicks();
    return jest;
  },
  async runAllTimersAsync() {
    assertFakeTimers();
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
    for (const timer of pending) {
      if (fakeTimers.timers.get(timer.id) === timer) runTimer(timer);
    }
    return jest;
  },
  async runOnlyPendingTimersAsync() {
    assertFakeTimers();
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
    const duration = timerDelay(milliseconds);
    runTimersUntil(fakeTimers.now + duration);
    return jest;
  },
  advanceTimersToNextFrame() {
    assertFakeTimers();
    runTimersUntil(fakeTimers.now + timeToNextFrame());
    return jest;
  },
  async advanceTimersByTimeAsync(milliseconds) {
    assertFakeTimers();
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
    fakeTimers.ticks.length = 0;
    return jest;
  },
  getTimerCount() {
    assertFakeTimers();
    return fakeTimers.timers.size + fakeTimers.ticks.length;
  },
  setSystemTime(value) {
    assertFakeTimers();
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
    return NativeDate.now();
  },
  clearAllMocks() {
    for (const mock of mockRegistry) mock.mockClear();
    return jest;
  },
  resetAllMocks() {
    for (const mock of mockRegistry) mock.mockReset();
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
  return names.reverse().join(' ');
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
  const testStarted = performance.now();
  const failures = beforeAllError ? [beforeAllError] : [];
  if (!beforeAllError) {
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
  configureTransforms();
  installJsdomEnvironment();
  configureSnapshotFormat();
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
