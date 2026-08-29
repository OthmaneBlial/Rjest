let attempts = 0;

jest.retryTimes(2);

test('discarded attempts roll back snapshot counters and results', () => {
  attempts += 1;
  expect(attempts).toMatchSnapshot();
  expect(attempts).toBe(3);
});
