afterEach(() => {
  jest.useRealTimers();
});

test('runs ticks, intervals, and timer cancellation in clock order', () => {
  jest.useFakeTimers();
  const calls = [];
  process.nextTick(() => calls.push('tick'));
  queueMicrotask(() => calls.push('microtask'));
  jest.runAllTicks();
  expect(calls).toEqual(['tick', 'microtask']);

  const interval = setInterval(() => calls.push('interval'), 10);
  setTimeout(() => {
    calls.push('stop');
    clearInterval(interval);
  }, 25);
  jest.runAllTimers();
  expect(calls).toEqual([
    'tick',
    'microtask',
    'interval',
    'interval',
    'stop',
  ]);
  expect(jest.getTimerCount()).toBe(0);
});

test('runs only timers that were pending at entry', () => {
  jest.useFakeTimers();
  const calls = [];
  setTimeout(() => {
    calls.push('outer');
    setTimeout(() => calls.push('inner'), 0);
  }, 100);
  jest.runOnlyPendingTimers();
  expect(calls).toEqual(['outer']);
  expect(jest.getTimerCount()).toBe(1);
  jest.runOnlyPendingTimers();
  expect(calls).toEqual(['outer', 'inner']);
});
