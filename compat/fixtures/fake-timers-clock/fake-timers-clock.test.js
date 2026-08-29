afterEach(() => {
  jest.useRealTimers();
});

test('controls Date and preserves pending delays across setSystemTime', () => {
  jest.useFakeTimers({now: new Date('2025-01-02T03:04:05.000Z')});
  expect(Date.now()).toBe(1735787045000);
  expect(new Date().toISOString()).toBe('2025-01-02T03:04:05.000Z');

  const callback = jest.fn();
  setTimeout(callback, 1000);
  jest.setSystemTime(new Date('2030-01-02T03:04:05.000Z'));
  expect(Date.now()).toBe(1893553445000);
  jest.advanceTimersByTime(999);
  expect(callback).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);
  expect(callback).toHaveBeenCalledTimes(1);
});
