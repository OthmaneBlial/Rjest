const events = [];
let attempt = 0;

test('runs a preceding sibling once', () => {
  events.push('outer before');
});

describe('local whole-describe retries', () => {
  jest.retryTimes(1, {entireDescribe: true});

  beforeAll(() => {
    attempt += 1;
    events.push(`beforeAll ${attempt}`);
  });

  test('reruns passing tests in the local describe', () => {
    events.push(`passing ${attempt}`);
  });

  test('retries locally after a failure', () => {
    events.push(`flaky ${attempt}`);
    expect(attempt).toBe(2);
  });

  afterAll(() => {
    events.push(`afterAll ${attempt}`);
  });
});

test('runs a following sibling once', () => {
  events.push('outer after');
  expect(events).toEqual([
    'outer before',
    'beforeAll 1',
    'passing 1',
    'flaky 1',
    'afterAll 1',
    'beforeAll 2',
    'passing 2',
    'flaky 2',
    'afterAll 2',
    'outer after',
  ]);
});
