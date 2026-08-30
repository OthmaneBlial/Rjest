afterEach(() => {
  jest.useRealTimers();
});

test('runOnlyPendingTimers includes nested work before the original last deadline', () => {
  jest.useFakeTimers({now: 0});
  const calls = [];

  setTimeout(() => {
    calls.push('first');
    setTimeout(() => calls.push('nested'), 5);
  }, 5);
  setTimeout(() => calls.push('last'), 20);

  jest.runOnlyPendingTimers();

  expect(calls).toEqual(['first', 'nested', 'last']);
  expect(Date.now()).toBe(20);
  expect(jest.getTimerCount()).toBe(0);
});

test('runOnlyPendingTimers repeats intervals through the original last deadline', () => {
  jest.useFakeTimers({now: 0});
  const calls = [];

  setInterval(() => calls.push(Date.now()), 10);
  setTimeout(() => calls.push('last'), 25);

  jest.runOnlyPendingTimers();

  expect(calls).toEqual([10, 20, 'last']);
  expect(Date.now()).toBe(25);
  expect(jest.getTimerCount()).toBe(1);
});

test('runOnlyPendingTimers leaves nested work beyond the original deadline pending', () => {
  jest.useFakeTimers({now: 0});
  const callback = jest.fn();

  setTimeout(() => setTimeout(callback, 5), 20);
  jest.runOnlyPendingTimers();

  expect(callback).not.toHaveBeenCalled();
  expect(Date.now()).toBe(20);
  expect(jest.getTimerCount()).toBe(1);
});

test('runOnlyPendingTimersAsync includes promise-scheduled work before the boundary', async () => {
  jest.useFakeTimers({now: 0});
  const calls = [];

  setTimeout(async () => {
    calls.push('first');
    await Promise.resolve();
    setTimeout(() => calls.push('nested'), 5);
  }, 5);
  setTimeout(() => calls.push('last'), 20);

  await jest.runOnlyPendingTimersAsync();

  expect(calls).toEqual(['first', 'nested', 'last']);
  expect(Date.now()).toBe(20);
  expect(jest.getTimerCount()).toBe(0);
});

test('runOnlyPendingTimers flushes fake microtasks without scheduled timers', () => {
  jest.useFakeTimers();
  const callback = jest.fn();
  queueMicrotask(callback);

  jest.runOnlyPendingTimers();

  expect(callback).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

test('runOnlyPendingTimersAsync flushes fake microtasks without scheduled timers', async () => {
  jest.useFakeTimers();
  const callback = jest.fn();
  queueMicrotask(callback);

  await jest.runOnlyPendingTimersAsync();

  expect(callback).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});
