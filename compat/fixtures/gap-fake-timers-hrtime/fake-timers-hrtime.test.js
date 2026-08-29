test('advances the high-resolution process clock with fake time', () => {
  jest.useFakeTimers();
  const start = process.hrtime.bigint();
  jest.advanceTimersByTime(25);
  expect(process.hrtime.bigint() - start).toBe(25_000_000n);
  jest.useRealTimers();
});
