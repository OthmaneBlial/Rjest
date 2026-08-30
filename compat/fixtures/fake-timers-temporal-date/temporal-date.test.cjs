afterEach(() => {
  jest.useRealTimers();
});

test('keeps Date callable while using modern fake timers', () => {
  const now = Date.UTC(2026, 0, 2, 3, 4, 5);
  jest.useFakeTimers({now});

  expect(Date()).toBe(new Date(now).toString());
  expect(new Date()).toEqual(new Date(now));
  expect(Date.parse('2026-01-01T00:00:00.000Z')).toBe(1767225600000);
  expect(Date.UTC(2026, 0, 1)).toBe(1767225600000);
});

test('accepts epochMilliseconds as the initial fake time', () => {
  jest.useFakeTimers({now: {epochMilliseconds: 123456}});

  expect(Date.now()).toBe(123456);
  expect(jest.now()).toBe(123456);
  expect(new Date().getTime()).toBe(123456);
});

test('accepts epochMilliseconds in setSystemTime', () => {
  jest.useFakeTimers({now: 0});
  jest.setSystemTime({epochMilliseconds: 987654});

  expect(Date.now()).toBe(987654);
  expect(jest.now()).toBe(987654);
});

test('sets the Unix epoch when setSystemTime has no argument', () => {
  jest.useFakeTimers({now: 5000});
  jest.setSystemTime();

  expect(Date.now()).toBe(0);
  expect(jest.now()).toBe(0);
});

test('accepts duration-like objects when advancing synchronously', () => {
  const calls = [];
  const callback = jest.fn();
  jest.useFakeTimers({now: 0});
  setTimeout(callback, 250);

  jest.advanceTimersByTime({
    total(options) {
      calls.push(options);
      return 250;
    },
  });

  expect(calls).toEqual([{unit: 'millisecond'}]);
  expect(callback).toHaveBeenCalledTimes(1);
  expect(jest.now()).toBe(250);
});

test('accepts duration-like objects when advancing asynchronously', async () => {
  const calls = [];
  const callback = jest.fn();
  jest.useFakeTimers({now: 10});
  setTimeout(callback, 40);

  await jest.advanceTimersByTimeAsync({
    total(options) {
      calls.push(options);
      return 40;
    },
  });

  expect(calls).toEqual([{unit: 'millisecond'}]);
  expect(callback).toHaveBeenCalledTimes(1);
  expect(jest.now()).toBe(50);
});

test('rejects negative synchronous and asynchronous advances', async () => {
  jest.useFakeTimers({now: 10});

  expect(() => jest.advanceTimersByTime(-1)).toThrow(/negative ticks/i);
  await expect(jest.advanceTimersByTimeAsync(-1)).rejects.toThrow(
    /negative ticks/i,
  );
  expect(jest.now()).toBe(10);
});

test('keeps duration-like advances available in legacy mode', () => {
  const callback = jest.fn();
  jest.useFakeTimers({legacyFakeTimers: true});
  setTimeout(callback, 25);

  jest.advanceTimersByTime({
    total: ({unit}) => (unit === 'millisecond' ? 25 : 0),
  });

  expect(callback).toHaveBeenCalledTimes(1);
});
