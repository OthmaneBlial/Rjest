let innerAttempts = 0;
let rootAttempts = 0;
let testInvocations = 0;

jest.retryTimes(1, {entireDescribe: true});

beforeAll(() => {
  rootAttempts += 1;
});

describe('local retry', () => {
  jest.retryTimes(1, {entireDescribe: true});

  beforeAll(() => {
    innerAttempts += 1;
  });

  test('composes nested and outer describe retries', () => {
    testInvocations += 1;
    expect(testInvocations).toBe(4);
  });
});

afterAll(() => {
  if (rootAttempts === 2) {
    expect(innerAttempts).toBe(4);
    expect(testInvocations).toBe(4);
  }
});
