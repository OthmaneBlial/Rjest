test('advances the performance clock with fake time', () => {
  jest.useFakeTimers({now: 0});
  expect(performance.now()).toBe(0);
  jest.advanceTimersByTime(75);
  expect(performance.now()).toBe(75);
  jest.useRealTimers();
});
