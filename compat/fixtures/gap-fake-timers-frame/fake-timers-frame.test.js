test('advances to the next animation frame boundary', () => {
  jest.useFakeTimers({now: 0});
  jest.advanceTimersToNextFrame();
  expect(performance.now()).toBe(16);
  jest.useRealTimers();
});
