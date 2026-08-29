const events = [];
let firstAttempts = 0;
let secondAttempts = 0;

jest.retryTimes(2);

test('deferred retries exhaust one failed test before the next', () => {
  firstAttempts += 1;
  events.push(`first ${firstAttempts}`);
  expect(firstAttempts).toBe(3);
});

test('deferred retries retain declaration order', () => {
  secondAttempts += 1;
  events.push(`second ${secondAttempts}`);
  expect(secondAttempts).toBe(2);
});

afterAll(() => {
  expect(events).toEqual([
    'first 1',
    'second 1',
    'first 2',
    'first 3',
    'second 2',
  ]);
});
