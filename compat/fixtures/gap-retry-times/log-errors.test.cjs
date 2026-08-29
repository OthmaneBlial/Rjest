let attempts = 0;

jest.retryTimes(2, {logErrorsBeforeRetry: true});

test('retains each discarded failure when logging is enabled', () => {
  attempts += 1;
  expect(attempts).toBe(3);
});
