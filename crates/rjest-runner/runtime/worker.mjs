import {readFileSync} from 'node:fs';
import {isDeepStrictEqual, format, inspect} from 'node:util';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';

const PROTOCOL_VERSION = 1;
const RESULT_PREFIX = '__RJEST_RESULT__';
const ASYMMETRIC = Symbol.for('rjest.asymmetricMatcher');
const nativeSetTimeout = globalThis.setTimeout;
const nativeClearTimeout = globalThis.clearTimeout;
const request = JSON.parse(readFileSync(0, 'utf8'));

if (request.protocolVersion !== PROTOCOL_VERSION) {
  throw new Error(`Unsupported Rjest worker protocol ${request.protocolVersion}`);
}

const started = performance.now();
const consoleEntries = [];
const fileErrors = [];
const mockRegistry = new Set();
let invocationOrder = 0;
let defaultTimeout = request.defaultTimeoutMs;

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

function deepEqual(received, expected, strict = false, seen = new WeakMap()) {
  if (isAsymmetric(expected)) return expected.asymmetricMatch(received);
  if (isAsymmetric(received)) return received.asymmetricMatch(expected);
  if (Object.is(received, expected)) return true;
  if (
    typeof received !== 'object' ||
    received === null ||
    typeof expected !== 'object' ||
    expected === null
  ) {
    return false;
  }
  if (
    strict &&
    Object.getPrototypeOf(received) !== Object.getPrototypeOf(expected)
  ) {
    return false;
  }
  if (seen.get(received) === expected) return true;
  seen.set(received, expected);
  if (received instanceof Date || expected instanceof Date) {
    return (
      received instanceof Date &&
      expected instanceof Date &&
      Object.is(received.getTime(), expected.getTime())
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
  if (received instanceof Error || expected instanceof Error) {
    return (
      received instanceof Error &&
      expected instanceof Error &&
      received.message === expected.message
    );
  }
  if (received instanceof Map || expected instanceof Map) {
    if (
      !(received instanceof Map && expected instanceof Map) ||
      received.size !== expected.size
    ) {
      return false;
    }
    const remaining = [...expected.entries()];
    return [...received.entries()].every(([key, value]) => {
      const index = remaining.findIndex(
        ([otherKey, otherValue]) =>
          deepEqual(key, otherKey, strict, seen) &&
          deepEqual(value, otherValue, strict, seen),
      );
      if (index < 0) return false;
      remaining.splice(index, 1);
      return true;
    });
  }
  if (received instanceof Set || expected instanceof Set) {
    if (
      !(received instanceof Set && expected instanceof Set) ||
      received.size !== expected.size
    ) {
      return false;
    }
    const remaining = [...expected.values()];
    return [...received.values()].every(value => {
      const index = remaining.findIndex(other =>
        deepEqual(value, other, strict, seen),
      );
      if (index < 0) return false;
      remaining.splice(index, 1);
      return true;
    });
  }
  if (ArrayBuffer.isView(received) || ArrayBuffer.isView(expected)) {
    return isDeepStrictEqual(received, expected);
  }
  const receivedKeys = enumerableKeys(received, strict);
  const expectedKeys = enumerableKeys(expected, strict);
  if (receivedKeys.length !== expectedKeys.length) return false;
  return expectedKeys.every(
    key =>
      receivedKeys.includes(key) &&
      deepEqual(received[key], expected[key], strict, seen),
  );
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

function spyOn(target, property) {
  if (
    (typeof target !== 'object' && typeof target !== 'function') ||
    target === null
  ) {
    throw new TypeError('Cannot use spyOn on a primitive value');
  }
  let owner = target;
  while (owner && !Object.prototype.hasOwnProperty.call(owner, property)) {
    owner = Object.getPrototypeOf(owner);
  }
  if (!owner) throw new Error(`Property ${String(property)} does not exist`);
  const descriptor = Object.getOwnPropertyDescriptor(owner, property);
  if (!descriptor || typeof descriptor.value !== 'function') {
    throw new TypeError(`Property ${String(property)} is not a function`);
  }
  const original = descriptor.value;
  if (isMock(original)) return original;
  const mock = createMock(function invokeOriginal(...args) {
    return original.apply(this, args);
  });
  const hadOwn = Object.prototype.hasOwnProperty.call(target, property);
  const ownDescriptor = Object.getOwnPropertyDescriptor(target, property);
  Object.defineProperty(target, property, {...descriptor, value: mock});
  mock._setRestore(() => {
    if (hadOwn) Object.defineProperty(target, property, ownDescriptor);
    else delete target[property];
  });
  return mock;
}

const jest = {
  fn: createMock,
  spyOn,
  clearAllMocks() {
    for (const mock of mockRegistry) mock.mockClear();
    return jest;
  },
  resetAllMocks() {
    for (const mock of mockRegistry) mock.mockReset();
    return jest;
  },
  restoreAllMocks() {
    for (const mock of mockRegistry) mock.mockRestore();
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
    result.status = 'todo';
    return result;
  }
  if (
    skipped ||
    node.mode === 'skip' ||
    (focusExists && !isSelected) ||
    !matchesName(node)
  ) {
    result.status = 'skipped';
    return result;
  }
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

const result = {
  protocolVersion: PROTOCOL_VERSION,
  testPath: request.testPath,
  tests,
  errors: fileErrors,
  console: consoleEntries,
  durationMs: Math.max(0, Math.round(performance.now() - started)),
};
process.stdout.write(`${RESULT_PREFIX}${JSON.stringify(result)}\n`, () => {
  process.exit(0);
});
