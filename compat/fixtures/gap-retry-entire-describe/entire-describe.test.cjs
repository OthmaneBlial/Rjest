const events = [];
let attempt = 0;

jest.retryTimes(1, {entireDescribe: true});

beforeAll(() => {
  attempt += 1;
  events.push(`beforeAll ${attempt}`);
});

test('reruns passing tests with the whole describe attempt', () => {
  events.push(`passing ${attempt}`);
});

test('retries the whole describe after a failure', () => {
  events.push(`flaky ${attempt}`);
  expect(attempt).toBe(2);
});

afterAll(() => {
  events.push(`afterAll ${attempt}`);
  if (attempt === 2) {
    expect(events).toEqual([
      'beforeAll 1',
      'passing 1',
      'flaky 1',
      'afterAll 1',
      'beforeAll 2',
      'passing 2',
      'flaky 2',
      'afterAll 2',
    ]);
  }
});
