test('advances modern fake timers deterministically', () => {
  jest.useFakeTimers();
  const callback = jest.fn();
  setTimeout(callback, 250);
  jest.advanceTimersByTime(249);
  expect(callback).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);
  expect(callback).toHaveBeenCalledTimes(1);
  jest.useRealTimers();
});

test('defers zero-delay timers created during a tick by one millisecond', () => {
  jest.useFakeTimers({now: 0});
  const calls = [];
  setTimeout(() => {
    calls.push(Date.now());
    setTimeout(() => calls.push(Date.now()), 0);
  }, 10);

  jest.advanceTimersByTime(10);
  expect(calls).toEqual([10]);

  jest.advanceTimersByTime(1);
  expect(calls).toEqual([10, 11]);
  jest.useRealTimers();
});
