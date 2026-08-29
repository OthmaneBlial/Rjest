let attempt = 0;
const orders = [];

jest.retryTimes(1, {entireDescribe: true});

beforeAll(() => {
  attempt += 1;
  orders.push([]);
});

test('one', () => {
  orders[attempt - 1].push('one');
});
test('two', () => {
  orders[attempt - 1].push('two');
});
test('flaky', () => {
  orders[attempt - 1].push('flaky');
  expect(attempt).toBe(2);
});

afterAll(() => {
  if (attempt === 2) expect(orders[0]).toEqual(orders[1]);
});
