test('awaits promise work scheduled by a timer', async () => {
  jest.useFakeTimers();
  const callback = jest.fn();
  setTimeout(async () => {
    await Promise.resolve();
    callback('finished');
  }, 50);
  await jest.advanceTimersByTimeAsync(50);
  expect(callback).toHaveBeenCalledWith('finished');
  jest.useRealTimers();
});

test('flushes pending native promises before advancing timers', async () => {
  jest.useFakeTimers();
  const callback = jest.fn();
  Promise.resolve().then(() => setTimeout(callback, 10));

  await jest.advanceTimersByTimeAsync(10);

  expect(callback).toHaveBeenCalledTimes(1);
  jest.useRealTimers();
});

test('defers zero-delay timers created by promise work during a tick', async () => {
  jest.useFakeTimers({now: 0});
  const callback = jest.fn();
  setTimeout(async () => {
    await Promise.resolve();
    setTimeout(callback, 0);
  }, 10);

  await jest.advanceTimersByTimeAsync(10);
  expect(callback).not.toHaveBeenCalled();

  await jest.advanceTimersByTimeAsync(1);
  expect(callback).toHaveBeenCalledTimes(1);
  jest.useRealTimers();
});
