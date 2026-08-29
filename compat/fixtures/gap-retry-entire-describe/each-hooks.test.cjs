describe('beforeEach failure', () => {
  let attempt = 0;
  let hookInvocations = 0;
  let testInvocations = 0;

  jest.retryTimes(1, {entireDescribe: true});

  beforeAll(() => {
    attempt += 1;
  });

  beforeEach(() => {
    hookInvocations += 1;
    if (attempt === 1) throw new Error('transient beforeEach failure');
  });

  test('retries the describe', () => {
    testInvocations += 1;
    expect(attempt).toBe(2);
  });

  afterAll(() => {
    if (attempt === 2) {
      expect(hookInvocations).toBe(2);
      expect(testInvocations).toBe(1);
    }
  });
});

describe('afterEach failure', () => {
  let attempt = 0;
  let hookInvocations = 0;
  let testInvocations = 0;

  jest.retryTimes(1, {entireDescribe: true});

  beforeAll(() => {
    attempt += 1;
  });

  afterEach(() => {
    hookInvocations += 1;
    if (attempt === 1) throw new Error('transient afterEach failure');
  });

  test('retries the describe', () => {
    testInvocations += 1;
  });

  afterAll(() => {
    if (attempt === 2) {
      expect(hookInvocations).toBe(2);
      expect(testInvocations).toBe(2);
    }
  });
});
