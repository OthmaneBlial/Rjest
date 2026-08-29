afterEach(() => {
  jest.useRealTimers();
});

test('uses mock window timers with numeric JSDOM handles', () => {
  const realDate = Date;
  const realWindowDate = window.Date;
  jest.useFakeTimers({legacyFakeTimers: true});
  const callback = jest.fn();

  const timer = window.setTimeout(callback, 10, 'window');

  expect(window.setTimeout).toBe(setTimeout);
  expect(jest.isMockFunction(window.setTimeout)).toBe(true);
  expect(jest.isMockFunction(window.clearTimeout)).toBe(true);
  expect(typeof timer).toBe('number');
  expect(Date).toBe(realDate);
  expect(window.Date).toBe(realWindowDate);

  jest.advanceTimersByTime(10);
  expect(callback).toHaveBeenCalledWith('window');
});

test('runs and cancels animation frames on the legacy clock', () => {
  jest.useFakeTimers({legacyFakeTimers: true});
  const calls = [];
  const cancelled = jest.fn();
  const start = jest.now();

  requestAnimationFrame(timestamp => calls.push(timestamp));
  cancelAnimationFrame(requestAnimationFrame(cancelled));

  expect(jest.isMockFunction(requestAnimationFrame)).toBe(true);
  expect(jest.isMockFunction(cancelAnimationFrame)).toBe(true);
  jest.advanceTimersByTime(15);
  expect(calls).toEqual([]);
  jest.advanceTimersByTime(1);
  expect(calls).toEqual([start + 16]);
  expect(cancelled).not.toHaveBeenCalled();
});
