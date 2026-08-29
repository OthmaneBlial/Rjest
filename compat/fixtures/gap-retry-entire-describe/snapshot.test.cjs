let attempt = 0;

jest.retryTimes(1, {entireDescribe: true});

beforeAll(() => {
  attempt += 1;
});

test('rolls back passing and failing snapshot work from the attempt', () => {
  expect(attempt).toMatchSnapshot();
});

test('causes the complete describe to retry', () => {
  expect(attempt).toBe(2);
});
