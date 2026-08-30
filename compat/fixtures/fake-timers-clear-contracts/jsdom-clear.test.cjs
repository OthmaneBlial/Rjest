/**
 * @jest-environment jsdom
 */

const nativeSetTimeout = window.setTimeout.bind(window);
const nativeClearTimeout = window.clearTimeout.bind(window);
const nativeSetInterval = window.setInterval.bind(window);
const nativeClearInterval = window.clearInterval.bind(window);
const nodeSetTimeout = require('node:timers').setTimeout;

afterEach(() => {
  jest.useRealTimers();
});

test('modern JSDOM fake timers clear a native window timeout', async () => {
  const callback = jest.fn();
  const timeout = nativeSetTimeout(callback, 10);

  try {
    jest.useFakeTimers();
    window.clearTimeout(timeout);
    await new Promise(resolve => nodeSetTimeout(resolve, 30));
    expect(callback).not.toHaveBeenCalled();
  } finally {
    nativeClearTimeout(timeout);
  }
});

test('modern JSDOM fake timers clear a native window interval', async () => {
  const callback = jest.fn();
  const interval = nativeSetInterval(callback, 5);

  try {
    jest.useFakeTimers();
    window.clearInterval(interval);
    await new Promise(resolve => nodeSetTimeout(resolve, 25));
    expect(callback).not.toHaveBeenCalled();
  } finally {
    nativeClearInterval(interval);
  }
});
