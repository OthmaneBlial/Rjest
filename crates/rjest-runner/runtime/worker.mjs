import {readFileSync} from 'node:fs';
import Module, {createRequire} from 'node:module';
import {isDeepStrictEqual, format, inspect} from 'node:util';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';

const PROTOCOL_VERSION = 2;
const RESULT_PREFIX = '__RJEST_RESULT__';
const ASYMMETRIC = Symbol.for('rjest.asymmetricMatcher');
const nativeSetTimeout = globalThis.setTimeout;
const nativeClearTimeout = globalThis.clearTimeout;
const request = JSON.parse(readFileSync(0, 'utf8'));
const requireFromTest = createRequire(request.testPath);
const originalModuleLoad = Module._load;
const moduleMocks = new Map();
const bypassModuleMocks = new Set();

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

function asymmetric(match, description) {
  return {
    [ASYMMETRIC]: true,
    asymmetricMatch: match,
    toString: () => description,
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
  const serialized = prettyFormat(value);
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

function matcherMessage(name, received, expected, isNot) {
  const expectedLabel =
    expected.length === 0
      ? ''
      : `\nExpected: ${printable(
          expected.length === 1 ? expected[0] : expected,
        )}`;
  return `expect(received)${isNot ? '.not' : ''}.${name}()${expectedLabel}\nReceived: ${printable(received)}`;
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
    if (arguments_.length > 1 || (arguments_.length === 1 && typeof arguments_[0] !== 'string')) {
      throw new Error(
        'Snapshot property matchers are not supported yet; pass an optional string hint only',
      );
    }
    const evaluate = received => {
      const outcome = matchSnapshot(received, arguments_[0]);
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
  }, `Any<${constructor?.name ?? 'anonymous'}>`);
expect.arrayContaining = sample =>
  asymmetric(
    value =>
      Array.isArray(value) &&
      sample.every(expected =>
        value.some(actual => deepEqual(actual, expected)),
      ),
    'ArrayContaining',
  );
expect.objectContaining = sample =>
  asymmetric(value => subsetEqual(value, sample), 'ObjectContaining');
expect.stringContaining = sample =>
  asymmetric(
    value => typeof value === 'string' && value.includes(String(sample)),
    'StringContaining',
  );
expect.stringMatching = sample =>
  asymmetric(
    value =>
      typeof value === 'string' &&
      (sample instanceof RegExp
        ? sample.test(value)
        : value.includes(String(sample))),
    'StringMatching',
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
      'NotArrayContaining',
    ),
  objectContaining: sample =>
    asymmetric(value => !subsetEqual(value, sample), 'NotObjectContaining'),
  stringContaining: sample =>
    asymmetric(
      value =>
        !(typeof value === 'string' && value.includes(String(sample))),
      'NotStringContaining',
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
      'NotStringMatching',
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

function resolveModuleKey(specifier) {
  return requireFromTest.resolve(String(specifier));
}

function loadActualModule(specifier) {
  const key = resolveModuleKey(specifier);
  bypassModuleMocks.add(key);
  try {
    return requireFromTest(specifier);
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

function registerModuleMock(specifier, factory) {
  const key = resolveModuleKey(specifier);
  if (factory !== undefined && typeof factory !== 'function') {
    throw new TypeError('The second argument of jest.mock must be a function');
  }
  moduleMocks.set(key, {
    factory,
    initialized: false,
    value: undefined,
    specifier: String(specifier),
  });
  delete Module._cache[key];
  return jest;
}

function requireMock(specifier) {
  const key = resolveModuleKey(specifier);
  if (!moduleMocks.has(key)) registerModuleMock(specifier);
  return requireFromTest(specifier);
}

Module._load = function rjestModuleLoad(specifier, parent, isMain) {
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
    try {
      entry.value = entry.factory
        ? entry.factory()
        : createAutoMock(loadActualModule(entry.specifier));
    } catch (error) {
      entry.initialized = false;
      throw error;
    }
  }
  return entry.value;
};

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
  await import(`${pathToFileURL(request.testPath).href}?rjest=${Date.now()}`);
  definitionComplete = true;
  tests = await runSuite(rootSuite, hasOnly(rootSuite));
  await new Promise(resolve => setImmediate(resolve));
} catch (error) {
  fileErrors.push(errorText(error));
}

if (snapshotState.update === 'all' && snapshotState.unchecked.size > 0) {
  for (const key of snapshotState.unchecked) delete snapshotState.data[key];
  snapshotState.removed = snapshotState.unchecked.size;
  snapshotState.unchecked.clear();
  snapshotState.dirty = true;
} else if (snapshotState.unchecked.size > 0) {
  fileErrors.push(
    `${snapshotState.unchecked.size} obsolete snapshot${snapshotState.unchecked.size === 1 ? '' : 's'} found. Run with --updateSnapshot to remove ${snapshotState.unchecked.size === 1 ? 'it' : 'them'}.\n` +
      [...snapshotState.unchecked].map(key => `  - ${key}`).join('\n'),
  );
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
};
process.stdout.write(`${RESULT_PREFIX}${JSON.stringify(result)}\n`, () => {
  process.exit(0);
});
