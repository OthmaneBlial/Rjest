const events = [];
let attempts = 0;

jest.retryTimes(2, {retryImmediately: true});

test('immediate retries run before the next test', () => {
  attempts += 1;
  events.push(`flaky ${attempts}`);
  expect(attempts).toBe(2);
});

test('the following test observes the completed retry', () => {
  events.push('following');
  expect(events).toEqual(['flaky 1', 'flaky 2', 'following']);
});
