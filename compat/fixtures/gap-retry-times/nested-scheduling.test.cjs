const events = [];
let attempts = 0;
let beforeAllCalls = 0;
let afterAllCalls = 0;

jest.retryTimes(1);

describe('nested retry boundary', () => {
  beforeAll(() => {
    beforeAllCalls += 1;
    events.push('beforeAll');
  });

  afterAll(() => {
    afterAllCalls += 1;
    events.push('afterAll');
  });

  test('retries before leaving its describe block', () => {
    attempts += 1;
    events.push(`nested ${attempts}`);
    expect(attempts).toBe(2);
  });
});

test('outer siblings run after nested retries and hooks finish', () => {
  expect(beforeAllCalls).toBe(1);
  expect(afterAllCalls).toBe(1);
  expect(events).toEqual([
    'beforeAll',
    'nested 1',
    'nested 2',
    'afterAll',
  ]);
});
