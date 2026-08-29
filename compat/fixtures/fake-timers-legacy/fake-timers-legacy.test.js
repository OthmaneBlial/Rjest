afterEach(() => {
  jest.useRealTimers();
});

test('installs mock timer APIs while preserving real clock APIs', () => {
  const realDate = Date;
  const realPerformance = performance;
  const before = Date.now();

  jest.useFakeTimers({legacyFakeTimers: true});

  expect(jest.isMockFunction(setTimeout)).toBe(true);
  expect(jest.isMockFunction(clearTimeout)).toBe(true);
  expect(jest.isMockFunction(setInterval)).toBe(true);
  expect(jest.isMockFunction(clearInterval)).toBe(true);
  expect(jest.isMockFunction(setImmediate)).toBe(true);
  expect(jest.isMockFunction(clearImmediate)).toBe(true);
  expect(jest.isMockFunction(process.nextTick)).toBe(true);
  expect(jest.isMockFunction(queueMicrotask)).toBe(false);
  expect(Date).toBe(realDate);
  expect(performance).toBe(realPerformance);
  expect(Date.now()).toBeGreaterThanOrEqual(before);
  expect(jest.now()).toBe(0);
});

test('records timer calls and returns Node-style timer references', () => {
  jest.useFakeTimers({legacyFakeTimers: true});
  const callback = jest.fn();

  const timer = setTimeout(callback, 25, 'payload');

  expect(setTimeout).toHaveBeenCalledWith(callback, 25, 'payload');
  expect(typeof timer).toBe('object');
  expect(typeof timer.ref).toBe('function');
  expect(typeof timer.unref).toBe('function');
  expect(timer.ref()).toBe(timer);
  expect(timer.unref()).toBe(timer);

  jest.advanceTimersByTime(25);
  expect(callback).toHaveBeenCalledWith('payload');
});

test('supports the Node promisified setTimeout contract', async () => {
  const {promisify} = require('node:util');
  jest.useFakeTimers({legacyFakeTimers: true});

  const result = promisify(setTimeout)(5, 'resolved');
  jest.runAllTimers();

  await expect(result).resolves.toBe('resolved');
});

test('keeps queueMicrotask on the real microtask queue', async () => {
  jest.useFakeTimers({legacyFakeTimers: true});
  const callback = jest.fn();

  queueMicrotask(callback);
  jest.runAllTicks();
  expect(callback).not.toHaveBeenCalled();

  await Promise.resolve();
  expect(callback).toHaveBeenCalledTimes(1);
});

test('drains ticks, immediates, and timers in legacy order', () => {
  jest.useFakeTimers({legacyFakeTimers: true});
  const calls = [];

  process.nextTick(() => calls.push('initial tick'));
  setImmediate(() => calls.push('initial immediate'));
  setTimeout(() => {
    calls.push('timeout');
    process.nextTick(() => calls.push('nested tick'));
    setImmediate(() => calls.push('nested immediate'));
  }, 0);
  setTimeout(() => calls.push('later timeout'), 10);

  jest.runAllTimers();

  expect(calls).toEqual([
    'initial tick',
    'initial immediate',
    'timeout',
    'nested immediate',
    'nested tick',
    'later timeout',
  ]);
});

test('invokes legacy callbacks with null as their strict receiver', () => {
  jest.useFakeTimers({legacyFakeTimers: true});
  const contexts = [];
  function recordContext() {
    'use strict';
    contexts.push(this);
  }

  process.nextTick(recordContext);
  setImmediate(recordContext);
  setTimeout(recordContext, 0);
  let interval;
  function recordIntervalContext() {
    'use strict';
    contexts.push(this);
    clearInterval(interval);
  }
  interval = setInterval(recordIntervalContext, 1);
  jest.runAllTimers();

  expect(contexts).toEqual([null, null, null, null]);
});

test('requires the Node timer reference when clearing legacy timeouts', () => {
  jest.useFakeTimers({legacyFakeTimers: true});
  const callback = jest.fn();
  const timer = setTimeout(callback, 5);

  clearTimeout(timer.id);
  jest.advanceTimersByTime(5);
  expect(callback).toHaveBeenCalledTimes(1);

  const cancelled = jest.fn();
  const cancelledTimer = setTimeout(cancelled, 5);
  clearTimeout(cancelledTimer);
  jest.advanceTimersByTime(5);
  expect(cancelled).not.toHaveBeenCalled();
});

test('runAllImmediates leaves ordinary timers pending', () => {
  jest.useFakeTimers({legacyFakeTimers: true});
  const calls = [];

  setTimeout(() => calls.push('timeout'), 0);
  setImmediate(() => calls.push('immediate'));
  jest.runAllImmediates();

  expect(calls).toEqual(['immediate']);
  expect(jest.getTimerCount()).toBe(1);
  jest.runAllTimers();
  expect(calls).toEqual(['immediate', 'timeout']);
});

test('runOnlyPendingTimers snapshots timers and advances the legacy clock', () => {
  jest.useFakeTimers({legacyFakeTimers: true});
  const calls = [];
  const start = jest.now();

  setTimeout(() => {
    calls.push('outer');
    setTimeout(() => calls.push('inner'), 20);
  }, 10);

  jest.runOnlyPendingTimers();
  expect(calls).toEqual(['outer']);
  expect(jest.now()).toBe(start + 10);
  expect(jest.getTimerCount()).toBe(1);

  jest.runOnlyPendingTimers();
  expect(calls).toEqual(['outer', 'inner']);
  expect(jest.now()).toBe(start + 30);
});

test('reinstalling legacy mocks preserves pending timers and clock state', () => {
  jest.useFakeTimers({legacyFakeTimers: true});
  const callback = jest.fn();
  const start = jest.now();
  setTimeout(callback, 10);
  const firstSetTimeout = setTimeout;

  jest.useRealTimers();
  jest.useFakeTimers({legacyFakeTimers: true});

  expect(setTimeout).not.toBe(firstSetTimeout);
  expect(jest.getTimerCount()).toBeGreaterThanOrEqual(1);
  jest.advanceTimersByTime(10);
  expect(callback).toHaveBeenCalledTimes(1);
  expect(jest.now()).toBe(start + 10);
});

test('clearAllTimers preserves queued ticks in legacy mode', () => {
  jest.useFakeTimers({legacyFakeTimers: true});
  const callback = jest.fn();
  const baseline = jest.getTimerCount();

  process.nextTick(callback, 'tick');
  setImmediate(callback, 'immediate');
  setTimeout(callback, 0, 'timeout');
  expect(jest.getTimerCount()).toBe(baseline + 3);

  jest.clearAllTimers();
  expect(jest.getTimerCount()).toBe(baseline + 1);
  jest.runAllTicks();
  expect(callback).toHaveBeenCalledTimes(1);
  expect(callback).toHaveBeenCalledWith('tick');
});

test('advances zero-based intervals without replacing Date', () => {
  const realDate = Date;
  jest.useFakeTimers({legacyFakeTimers: true});
  const callback = jest.fn();
  const interval = setInterval(callback, 10);
  const start = jest.now();

  jest.advanceTimersByTime(25);
  expect(callback).toHaveBeenCalledTimes(2);
  expect(jest.now()).toBe(start + 25);
  expect(Date).toBe(realDate);

  clearInterval(interval);
  expect(jest.getTimerCount()).toBe(0);
});

test('rejects controls that only modern fake timers provide', async () => {
  jest.useFakeTimers({legacyFakeTimers: true});

  expect(() => jest.advanceTimersToNextFrame()).toThrow(
    'not available when using legacy fake timers',
  );
  expect(() => jest.getRealSystemTime()).toThrow(
    'not available when using legacy fake timers',
  );
  expect(() => jest.setSystemTime(0)).toThrow(
    'not available when using legacy fake timers',
  );
  await expect(jest.advanceTimersByTimeAsync(1)).rejects.toThrow(
    'not available when using legacy fake timers',
  );
  await expect(jest.advanceTimersToNextTimerAsync()).rejects.toThrow(
    'not available when using legacy fake timers',
  );
  await expect(jest.runAllTimersAsync()).rejects.toThrow(
    'not available when using legacy fake timers',
  );
  await expect(jest.runOnlyPendingTimersAsync()).rejects.toThrow(
    'not available when using legacy fake timers',
  );
});
