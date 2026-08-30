afterEach(() => {
  jest.useRealTimers();
});

function captureError(callback) {
  try {
    callback();
    return null;
  } catch (error) {
    return {
      name: error.name,
      message: error.message,
    };
  }
}

function probeInvalid(schedule) {
  jest.useFakeTimers();
  const scheduleError = captureError(schedule);
  const countBeforeRun = jest.getTimerCount();
  const runError = captureError(() => jest.runAllTicks());
  const countAfterRun = jest.getTimerCount();
  jest.useRealTimers();
  return {scheduleError, countBeforeRun, runError, countAfterRun};
}

function expectDeferredFailure(schedule, message) {
  expect(probeInvalid(schedule)).toEqual({
    scheduleError: null,
    countBeforeRun: 1,
    runError: {
      name: 'TypeError',
      message,
    },
    countAfterRun: 1,
  });
}

test('nextTick defers invalid callback failures until the queue drains', () => {
  expectDeferredFailure(
    () => process.nextTick(),
    "Cannot read properties of undefined (reading 'apply')",
  );
  expectDeferredFailure(
    () => process.nextTick('callback'),
    'job.func.apply is not a function',
  );
  expectDeferredFailure(
    () => process.nextTick(null),
    "Cannot read properties of null (reading 'apply')",
  );
});

test('queueMicrotask defers invalid callback failures until the queue drains', () => {
  expectDeferredFailure(
    () => queueMicrotask(),
    "Cannot read properties of undefined (reading 'apply')",
  );
  expectDeferredFailure(
    () => queueMicrotask('callback'),
    'job.func.apply is not a function',
  );
  expectDeferredFailure(
    () => queueMicrotask(null),
    "Cannot read properties of null (reading 'apply')",
  );
});

test('a thrown microtask retains and replays the complete queue', () => {
  jest.useFakeTimers();
  const calls = [];
  process.nextTick(() => calls.push('before'));
  queueMicrotask(() => {
    calls.push('throw');
    throw new Error('microtask failed');
  });
  process.nextTick(() => calls.push('after'));

  const firstError = captureError(() => jest.runAllTicks());
  const firstCount = jest.getTimerCount();
  const secondError = captureError(() => jest.runAllTicks());
  const secondCount = jest.getTimerCount();

  expect({calls, firstError, firstCount, secondError, secondCount}).toEqual({
    calls: ['before', 'throw', 'before', 'throw'],
    firstError: {name: 'Error', message: 'microtask failed'},
    firstCount: 3,
    secondError: {name: 'Error', message: 'microtask failed'},
    secondCount: 3,
  });
});

test('successful drains include nested jobs and forward nextTick arguments', () => {
  jest.useFakeTimers();
  const calls = [];

  process.nextTick(
    (first, second) => calls.push(`${first}:${second}`),
    'left',
    'right',
  );
  queueMicrotask(() => {
    calls.push('outer');
    process.nextTick(() => calls.push('nested'));
  });

  jest.runAllTicks();

  expect(calls).toEqual(['left:right', 'outer', 'nested']);
  expect(jest.getTimerCount()).toBe(0);
});
