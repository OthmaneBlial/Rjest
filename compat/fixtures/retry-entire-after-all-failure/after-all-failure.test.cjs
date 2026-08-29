let attempt = 0;

jest.retryTimes(1, {entireDescribe: true});

beforeAll(() => {
  attempt += 1;
});

test('does not retry an afterAll-only failure', () => {
  expect(attempt).toBe(1);
});

afterAll(() => {
  throw new Error(`persistent afterAll attempt ${attempt}`);
});
