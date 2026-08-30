const realSetTimeout = setTimeout;
const waitForRealTime = milliseconds =>
  new Promise(resolve => realSetTimeout(resolve, milliseconds));

afterEach(() => {
  jest.useRealTimers();
});

test('manual mode leaves scheduled timers paused', async () => {
  jest.useFakeTimers({advanceTimers: true});
  jest.setTimerTickMode({mode: 'manual'});
  const callback = jest.fn();

  setTimeout(callback, 5);
  await waitForRealTime(20);

  expect(callback).not.toHaveBeenCalled();
  expect(jest.now()).toBeLessThan(Date.now() + 1);
});

test('nextAsync mode advances to each next timer across macrotasks', async () => {
  jest.useFakeTimers({now: 1000});
  jest.setTimerTickMode({mode: 'nextAsync'});

  await new Promise(resolve => setTimeout(resolve, 5000));
  await new Promise(resolve => setTimeout(resolve, 5000));
  await new Promise(resolve => setTimeout(resolve, 5000));

  expect(Date.now()).toBe(16000);
});

test('interval mode advances fake time with real time', async () => {
  jest.useFakeTimers({now: 1000});
  jest.setTimerTickMode({delta: 10, mode: 'interval'});
  const callback = jest.fn();

  setTimeout(callback, 10);
  await waitForRealTime(2);
  expect(callback).not.toHaveBeenCalled();

  await waitForRealTime(20);
  expect(callback).toHaveBeenCalledTimes(1);
  expect(Date.now()).toBeGreaterThanOrEqual(1010);
});

test('tick mode can return to manual without leaking auto advancement', async () => {
  jest.useFakeTimers();
  jest.setTimerTickMode({mode: 'nextAsync'});
  await new Promise(resolve => setTimeout(resolve, 25));

  jest.setTimerTickMode({mode: 'manual'});
  const callback = jest.fn();
  setTimeout(callback, 1);
  await waitForRealTime(20);

  expect(callback).not.toHaveBeenCalled();
});

test('explicit async advancement temporarily pauses nextAsync mode', async () => {
  jest.useFakeTimers({now: 0});
  jest.setTimerTickMode({mode: 'nextAsync'});
  const callback = jest.fn();
  setTimeout(callback, 100);

  await jest.advanceTimersByTimeAsync(50);

  expect(Date.now()).toBe(50);
  expect(callback).not.toHaveBeenCalled();

  await new Promise(resolve => setTimeout(resolve, 50));
  expect(callback).toHaveBeenCalledTimes(1);
  expect(Date.now()).toBe(100);
});

test('legacy fake timers reject automatic tick modes', () => {
  jest.useFakeTimers({legacyFakeTimers: true});

  expect(() => jest.setTimerTickMode({mode: 'nextAsync'})).toThrow(
    /not available when using legacy fake timers/,
  );
});
