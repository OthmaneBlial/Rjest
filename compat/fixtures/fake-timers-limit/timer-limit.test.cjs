const recursionError = limit =>
  new Error(
    `Aborting after running ${limit} timers, assuming an infinite loop!`,
  );

afterEach(() => {
  jest.clearAllTimers();
  jest.useFakeTimers();
});

test('configured timerLimit stops recursive timers at the Jest boundary', () => {
  let calls = 0;
  function recurse() {
    calls += 1;
    setTimeout(recurse, 0);
  }
  setTimeout(recurse, 0);

  expect(() => jest.runAllTimers()).toThrow(recursionError(3));
  expect(calls).toBe(3);
});

test('runtime timerLimit overrides the configured boundary', () => {
  jest.useFakeTimers({timerLimit: 5});
  let calls = 0;
  function recurse() {
    calls += 1;
    setTimeout(recurse, 0);
  }
  setTimeout(recurse, 0);

  expect(() => jest.runAllTimers()).toThrow(recursionError(5));
  expect(calls).toBe(5);
});

test('timerLimit also guards recursively scheduled ticks', () => {
  let calls = 0;
  function recurse() {
    calls += 1;
    process.nextTick(recurse);
  }
  process.nextTick(recurse);

  expect(() => jest.runAllTicks()).toThrow(recursionError(3));
  expect(calls).toBe(5);
});

test('timerLimit does not cap finite synchronous time advancement', () => {
  let calls = 0;
  function recurse() {
    calls += 1;
    setTimeout(recurse, 0);
  }
  setTimeout(recurse, 0);

  expect(() => jest.advanceTimersByTime(100)).not.toThrow();
  expect(calls).toBe(101);
});

test('timerLimit guards asynchronous timer drains', async () => {
  let calls = 0;
  function recurse() {
    calls += 1;
    setTimeout(recurse, 0);
  }
  setTimeout(recurse, 0);

  await expect(jest.runAllTimersAsync()).rejects.toThrow(recursionError(3));
  expect(calls).toBe(3);
});

test('timerLimit does not cap finite asynchronous time advancement', async () => {
  let calls = 0;
  function recurse() {
    calls += 1;
    setTimeout(recurse, 0);
  }
  setTimeout(recurse, 0);

  await expect(jest.advanceTimersByTimeAsync(100)).resolves.toBeUndefined();
  expect(calls).toBe(101);
});
