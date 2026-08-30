/**
 * @jest-environment jsdom
 */

afterEach(() => {
  jest.useRealTimers();
});

test('modern JSDOM timers retain numeric browser handles', () => {
  jest.useFakeTimers();
  const callback = jest.fn();
  const timeout = setTimeout(callback, 10);
  const interval = setInterval(callback, 10);

  expect(typeof timeout).toBe('number');
  expect(typeof interval).toBe('number');

  clearTimeout(timeout);
  clearInterval(interval);
  jest.runAllTimers();
  expect(callback).not.toHaveBeenCalled();
});
