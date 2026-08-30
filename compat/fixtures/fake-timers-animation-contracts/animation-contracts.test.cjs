afterEach(() => {
  jest.useRealTimers();
});

function captureError(callback) {
  try {
    callback();
    return null;
  } catch (error) {
    return {
      name: error.name,
      message: error.message,
    };
  }
}

test('modern animation frame handles remain numeric in JSDOM', () => {
  jest.useFakeTimers({now: 0});

  const frame = requestAnimationFrame(() => {});

  expect(typeof frame).toBe('number');
  cancelAnimationFrame(frame);
});

test('modern animation frame callbacks use Sinons timer diagnostics', () => {
  jest.useFakeTimers();

  expect(captureError(() => requestAnimationFrame())).toEqual({
    name: 'Error',
    message: 'Callback must be provided to timer calls',
  });
  expect(captureError(() => requestAnimationFrame('callback'))).toEqual({
    name: 'TypeError',
    message:
      '[ERR_INVALID_CALLBACK]: Callback must be a function. Received callback of type string',
  });
});

test('animation frames reject clearing through the wrong timer API', () => {
  jest.useFakeTimers({now: 0});

  const frame = requestAnimationFrame(() => {});
  const timeout = setTimeout(() => {}, 10);

  expect(captureError(() => cancelAnimationFrame(timeout))).toEqual({
    name: 'Error',
    message:
      'Cannot clear timer: timer created with setTimeout() but cleared with cancelAnimationFrame()',
  });
  expect(captureError(() => clearTimeout(frame))).toEqual({
    name: 'Error',
    message:
      'Cannot clear timer: timer created with requestAnimationFrame() but cleared with clearTimeout()',
  });
  expect(jest.getTimerCount()).toBe(2);

  cancelAnimationFrame(frame);
  clearTimeout(timeout);
});

test('fake cancellation forwards pre-existing native animation frames', async () => {
  const callback = jest.fn();
  const nativeFrame = requestAnimationFrame(callback);

  jest.useFakeTimers();
  cancelAnimationFrame(nativeFrame);
  jest.useRealTimers();

  await new Promise(resolve => setTimeout(resolve, 40));
  expect(callback).not.toHaveBeenCalled();
});
