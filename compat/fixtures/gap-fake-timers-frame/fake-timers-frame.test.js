test('advances to the next animation frame boundary', () => {
  jest.useFakeTimers({now: 0});
  const events = [];
  setTimeout(() => events.push(['timeout', performance.now()]), 10);
  requestAnimationFrame(timestamp => events.push(['frame', timestamp]));

  jest.advanceTimersToNextFrame();

  expect(performance.now()).toBe(16);
  expect(events).toEqual([
    ['timeout', 10],
    ['frame', 16],
  ]);

  jest.advanceTimersByTime(5);
  requestAnimationFrame(timestamp => events.push(['second frame', timestamp]));
  jest.advanceTimersToNextFrame();
  expect(performance.now()).toBe(32);
  expect(events.at(-1)).toEqual(['second frame', 32]);

  const cancelled = jest.fn();
  cancelAnimationFrame(requestAnimationFrame(cancelled));
  jest.advanceTimersToNextFrame();
  expect(cancelled).not.toHaveBeenCalled();
  jest.useRealTimers();
});
