let attempts = 0;
const startedAt = Date.now();

jest.retryTimes(1, {waitBeforeRetry: 20});

test('waitBeforeRetry delays each retry with a real timer', () => {
  attempts += 1;
  if (attempts === 1) {
    throw new Error('retry after the configured delay');
  }
  expect(Date.now() - startedAt >= 15).toBe(true);
});
