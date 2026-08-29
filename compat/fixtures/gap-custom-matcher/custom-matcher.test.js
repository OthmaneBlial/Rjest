expect.extend({
  toBeDivisibleBy(received, divisor) {
    return {
      pass: received % divisor === 0,
      message: () => `expected ${received} to be divisible by ${divisor}`,
    };
  },
});

test('runs a custom matcher', () => {
  expect(12).toBeDivisibleBy(3);
});
