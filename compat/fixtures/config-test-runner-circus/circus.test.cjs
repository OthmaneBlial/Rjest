test('runs a suite with an explicit Circus runner', () => {
  expect(jest.isMockFunction(jest.fn())).toBe(true);
});

test.failing('keeps Circus-specific failing semantics', () => {
  throw new Error('expected Circus failure');
});
