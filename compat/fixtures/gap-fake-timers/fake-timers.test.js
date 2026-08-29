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
