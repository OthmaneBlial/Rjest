const warningPrefix =
  'A function to advance timers was called but the timers APIs are not replaced with fake timers.';

function expectTimerWarning(warn) {
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn.mock.calls[0][0]).toContain(warningPrefix);
  expect(warn.mock.calls[0][0]).toContain('Stack Trace:');
}

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('clearAllTimers silently does nothing while real timers are active', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

  expect(jest.clearAllTimers()).toBeUndefined();
  expect(warn).not.toHaveBeenCalled();
});

test('synchronous timer controls warn and no-op while real timers are active', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const realNow = Date.now();
  const controls = [
    () => jest.runAllTicks(),
    () => jest.runAllTimers(),
    () => jest.runOnlyPendingTimers(),
    () => jest.advanceTimersByTime(25),
    () => jest.advanceTimersToNextTimer(),
    () => jest.advanceTimersToNextFrame(),
    () => jest.setSystemTime(0),
  ];

  for (const control of controls) {
    warn.mockClear();
    expect(control()).toBeUndefined();
    expectTimerWarning(warn);
  }

  expect(Date.now()).toBeGreaterThanOrEqual(realNow);
});

test('real-mode timer queries preserve Jest return and warning behavior', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const before = Date.now();

  expect(jest.getTimerCount()).toBe(0);
  expectTimerWarning(warn);

  warn.mockClear();
  expect(jest.now()).toBeGreaterThanOrEqual(before);
  expect(jest.getRealSystemTime()).toBeGreaterThanOrEqual(before);
  expect(warn).not.toHaveBeenCalled();

  expect(jest.setTimerTickMode({mode: 'manual'})).toBe(jest);
  expectTimerWarning(warn);
});

test('asynchronous timer controls resolve after warning in real mode', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const controls = [
    () => jest.runAllTimersAsync(),
    () => jest.runOnlyPendingTimersAsync(),
    () => jest.advanceTimersByTimeAsync(25),
    () => jest.advanceTimersToNextTimerAsync(),
  ];

  for (const control of controls) {
    warn.mockClear();
    await expect(control()).resolves.toBeUndefined();
    expectTimerWarning(warn);
  }
});

test('active timer controls retain Jest public return contracts', async () => {
  expect(jest.useFakeTimers({now: 0})).toBe(jest);

  expect(jest.runAllTicks()).toBeUndefined();
  expect(jest.runAllTimers()).toBeUndefined();
  expect(jest.runOnlyPendingTimers()).toBeUndefined();
  expect(jest.advanceTimersByTime(1)).toBeUndefined();
  expect(jest.advanceTimersToNextTimer()).toBeUndefined();
  expect(jest.advanceTimersToNextFrame()).toBeUndefined();
  expect(jest.setSystemTime(100)).toBeUndefined();
  expect(jest.clearAllTimers()).toBeUndefined();
  await expect(jest.runAllTimersAsync()).resolves.toBeUndefined();
  await expect(jest.runOnlyPendingTimersAsync()).resolves.toBeUndefined();
  await expect(jest.advanceTimersByTimeAsync(1)).resolves.toBeUndefined();
  await expect(jest.advanceTimersToNextTimerAsync()).resolves.toBeUndefined();
  expect(jest.setTimerTickMode({mode: 'manual'})).toBe(jest);
  expect(jest.useRealTimers()).toBe(jest);
});

test('legacy real-mode controls use the legacy warning contract', () => {
  jest.useFakeTimers({legacyFakeTimers: true});
  jest.useRealTimers();
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

  expect(jest.getTimerCount()).toBe(0);
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn.mock.calls[0][0]).toContain(
    'timers APIs are not mocked with fake timers',
  );
  expect(warn.mock.calls[0][0]).toContain(
    'jest.useFakeTimers({legacyFakeTimers: true})',
  );

  warn.mockClear();
  expect(jest.advanceTimersToNextTimer()).toBeUndefined();
  expect(warn).not.toHaveBeenCalled();

  jest.useFakeTimers();
  jest.useRealTimers();
});
