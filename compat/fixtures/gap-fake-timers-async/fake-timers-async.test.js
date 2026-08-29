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
