const dependency = require('./dependency.cjs');

test('automocks modules from the CLI override', () => {
  expect(jest.isMockFunction(dependency.calculate)).toBe(true);
  expect(dependency.calculate(2, 3)).toBeUndefined();
});
