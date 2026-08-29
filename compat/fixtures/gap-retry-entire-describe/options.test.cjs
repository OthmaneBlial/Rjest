let attempt = 0;
let failedAt = 0;

jest.retryTimes(1, {
  entireDescribe: true,
  logErrorsBeforeRetry: true,
  waitBeforeRetry: 20,
});

beforeAll(() => {
  attempt += 1;
});

test('waits and retains the discarded failure', () => {
  if (attempt === 1) failedAt = Date.now();
  if (attempt === 2) expect(Date.now() - failedAt >= 15).toBe(true);
  expect(attempt).toBe(2);
});
