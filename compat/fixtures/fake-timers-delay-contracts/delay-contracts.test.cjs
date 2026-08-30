afterEach(() => {
  jest.useRealTimers();
});

test('delays above the signed 32-bit maximum clamp to one millisecond', () => {
  jest.useFakeTimers({now: 0});
  const timeout = jest.fn();
  const interval = jest.fn();

  setTimeout(timeout, 2 ** 31);
  setInterval(interval, 2 ** 31);

  jest.advanceTimersByTime(1);
  expect(timeout).toHaveBeenCalledTimes(1);
  expect(interval).toHaveBeenCalledTimes(1);

  jest.advanceTimersByTime(2);
  expect(interval).toHaveBeenCalledTimes(3);
});

test('the signed 32-bit maximum remains an exact deadline', () => {
  jest.useFakeTimers({now: 0});
  const callback = jest.fn();

  setTimeout(callback, 2 ** 31 - 1);
  jest.advanceTimersByTime(2 ** 31 - 2);
  expect(callback).not.toHaveBeenCalled();

  jest.advanceTimersByTime(1);
  expect(callback).toHaveBeenCalledTimes(1);
  expect(Date.now()).toBe(2 ** 31 - 1);
});

test('string delays use parseInt semantics', () => {
  jest.useFakeTimers({now: 0});
  const callback = jest.fn();

  setTimeout(callback, '10ms');
  jest.advanceTimersByTime(9);
  expect(callback).not.toHaveBeenCalled();

  jest.advanceTimersByTime(1);
  expect(callback).toHaveBeenCalledTimes(1);
});

test('non-finite delays run at the current fake time', () => {
  jest.useFakeTimers({now: 100});
  const calls = [];

  setTimeout(() => calls.push(Date.now()), Number.POSITIVE_INFINITY);
  setTimeout(() => calls.push(Date.now()), Number.NaN);
  jest.advanceTimersByTime(0);

  expect(calls).toEqual([100, 100]);
});

test('missing callbacks use Sinons timer diagnostic', () => {
  jest.useFakeTimers();

  for (const schedule of [setTimeout, setInterval, setImmediate]) {
    expect(() => schedule()).toThrow('Callback must be provided to timer calls');
  }
});

test('non-function callbacks use Sinons invalid-callback diagnostic', () => {
  jest.useFakeTimers();

  expect(() => setTimeout('source text', 0)).toThrow(
    '[ERR_INVALID_CALLBACK]: Callback must be a function. Received source text of type string',
  );
  expect(() => setInterval(null, 0)).toThrow(
    '[ERR_INVALID_CALLBACK]: Callback must be a function. Received null of type object',
  );
  expect(() => setImmediate(42)).toThrow(
    '[ERR_INVALID_CALLBACK]: Callback must be a function. Received 42 of type number',
  );
});
