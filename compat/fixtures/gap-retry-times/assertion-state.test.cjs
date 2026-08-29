let attempts = 0;

jest.retryTimes(1);

test('assertion bookkeeping starts fresh on every attempt', () => {
  attempts += 1;
  expect.assertions(attempts === 1 ? 2 : 1);
  expect(attempts).toBe(2);
});
