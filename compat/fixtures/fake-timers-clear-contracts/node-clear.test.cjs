const nativeSetTimeout = setTimeout;
const nativeClearTimeout = clearTimeout;
const nativeSetInterval = setInterval;
const nativeClearInterval = clearInterval;
const nativeSetImmediate = setImmediate;
const nativeClearImmediate = clearImmediate;

const waitForRealTime = milliseconds =>
  new Promise(resolve => nativeSetTimeout(resolve, milliseconds));

afterEach(() => {
  jest.useRealTimers();
});

test('modern fake timers clear a native timeout created before installation', async () => {
  const callback = jest.fn();
  const timeout = nativeSetTimeout(callback, 10);

  try {
    jest.useFakeTimers();
    clearTimeout(timeout);
    await waitForRealTime(30);
    expect(callback).not.toHaveBeenCalled();
  } finally {
    nativeClearTimeout(timeout);
  }
});

test('modern fake timers clear a native interval created before installation', async () => {
  const callback = jest.fn();
  const interval = nativeSetInterval(callback, 5);

  try {
    jest.useFakeTimers();
    clearInterval(interval);
    await waitForRealTime(25);
    expect(callback).not.toHaveBeenCalled();
  } finally {
    nativeClearInterval(interval);
  }
});

test('modern fake timers clear a native immediate created before installation', async () => {
  const callback = jest.fn();
  const immediate = nativeSetImmediate(callback);

  try {
    jest.useFakeTimers();
    clearImmediate(immediate);
    await waitForRealTime(10);
    expect(callback).not.toHaveBeenCalled();
  } finally {
    nativeClearImmediate(immediate);
  }
});

test('timeouts and intervals retain Node-compatible cross-clear behavior', () => {
  jest.useFakeTimers();
  const timeout = setTimeout(() => {}, 10);
  const interval = setInterval(() => {}, 10);

  expect(clearInterval(timeout)).toBeUndefined();
  expect(clearTimeout(interval)).toBeUndefined();
  expect(jest.getTimerCount()).toBe(0);
});

test('clearTimeout rejects an immediate handle', () => {
  jest.useFakeTimers();
  const immediate = setImmediate(() => {});

  expect(() => clearTimeout(immediate)).toThrow(
    'Cannot clear timer: timer created with setImmediate() but cleared with clearTimeout()',
  );
});

test('clearImmediate rejects a timeout handle', () => {
  jest.useFakeTimers();
  const timeout = setTimeout(() => {}, 10);

  expect(() => clearImmediate(timeout)).toThrow(
    'Cannot clear timer: timer created with setTimeout() but cleared with clearImmediate()',
  );
});
