afterEach(() => {
  jest.useRealTimers();
});

test('modern Node timers expose the Sinon handle protocol', () => {
  jest.useFakeTimers();
  const timeout = setTimeout(() => {}, 10);
  const interval = setInterval(() => {}, 10);
  const immediate = setImmediate(() => {});

  for (const handle of [timeout, interval, immediate]) {
    expect(typeof handle).toBe('object');
    expect(typeof handle.ref).toBe('function');
    expect(typeof handle.unref).toBe('function');
    expect(typeof handle.hasRef).toBe('function');
    expect(typeof handle.refresh).toBe('function');
    expect(handle.hasRef()).toBe(true);
    expect(handle.unref()).toBe(handle);
    expect(handle.hasRef()).toBe(false);
    expect(handle.ref()).toBe(handle);
    expect(handle.hasRef()).toBe(true);
    expect(Number.isSafeInteger(Number(handle))).toBe(true);
    expect(Number(handle) >= 1_000_000_000_000).toBe(true);
  }

  clearTimeout(timeout);
  clearInterval(interval);
  clearImmediate(immediate);
  expect(jest.getTimerCount()).toBe(0);
});

test('modern handles can be cleared through their numeric primitive', () => {
  jest.useFakeTimers();
  const timeoutCallback = jest.fn();
  const immediateCallback = jest.fn();
  const timeout = setTimeout(timeoutCallback, 10);
  const immediate = setImmediate(immediateCallback);

  clearTimeout(Number(timeout));
  clearImmediate(Number(immediate));
  jest.runAllTimers();

  expect(timeoutCallback).not.toHaveBeenCalled();
  expect(immediateCallback).not.toHaveBeenCalled();
});

test('refresh reschedules a timeout from the current fake time', () => {
  jest.useFakeTimers({now: 0});
  const callback = jest.fn();
  const timeout = setTimeout(callback, 10);

  jest.advanceTimersByTime(5);
  expect(timeout.refresh()).toBe(timeout);
  jest.advanceTimersByTime(5);
  expect(callback).not.toHaveBeenCalled();
  jest.advanceTimersByTime(5);
  expect(callback).toHaveBeenCalledTimes(1);

  expect(timeout.refresh()).toBe(timeout);
  jest.advanceTimersByTime(10);
  expect(callback).toHaveBeenCalledTimes(2);
});

test('refresh moves a timer behind existing work at the new deadline', () => {
  jest.useFakeTimers({now: 0});
  const calls = [];
  const first = setTimeout(() => calls.push('refreshed'), 10);
  setTimeout(() => calls.push('existing'), 15);

  jest.advanceTimersByTime(5);
  first.refresh();
  jest.advanceTimersByTime(10);

  expect(calls).toEqual(['existing', 'refreshed']);
});

test('refresh postpones the next interval occurrence', () => {
  jest.useFakeTimers({now: 0});
  const callback = jest.fn();
  const interval = setInterval(callback, 10);

  jest.advanceTimersByTime(10);
  expect(callback).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(5);
  interval.refresh();
  jest.advanceTimersByTime(5);
  expect(callback).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(5);
  expect(callback).toHaveBeenCalledTimes(2);

  clearInterval(interval);
});

test('a handle from an old fake clock cannot refresh into a new clock', () => {
  jest.useFakeTimers();
  const callback = jest.fn();
  const oldTimeout = setTimeout(callback, 10);

  jest.useFakeTimers();
  oldTimeout.refresh();
  jest.runAllTimers();

  expect(callback).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

test('a stale handle cannot clear a timer from a new fake clock', () => {
  jest.useFakeTimers();
  const staleCallback = jest.fn();
  const staleTimeout = setTimeout(staleCallback, 10);

  jest.useFakeTimers();
  const currentCallback = jest.fn();
  const currentTimeout = setTimeout(currentCallback, 10);
  expect(Number(currentTimeout)).not.toBe(Number(staleTimeout));

  clearTimeout(staleTimeout);
  jest.runAllTimers();

  expect(staleCallback).not.toHaveBeenCalled();
  expect(currentCallback).toHaveBeenCalledTimes(1);
});
