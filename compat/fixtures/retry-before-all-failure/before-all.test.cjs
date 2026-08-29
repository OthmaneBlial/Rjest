let beforeAllCalls = 0;
let bodyCalls = 0;

jest.retryTimes(2);

describe('beforeAll failure boundary', () => {
  beforeAll(() => {
    beforeAllCalls += 1;
    throw new Error('beforeAll failures are not retryable per test');
  });

  test('does not invoke the test body', () => {
    bodyCalls += 1;
  });
});

test('continues outside the failed describe without retrying its hook', () => {
  expect(beforeAllCalls).toBe(1);
  expect(bodyCalls).toBe(0);
});
