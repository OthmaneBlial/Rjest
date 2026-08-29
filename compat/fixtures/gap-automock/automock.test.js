jest.enableAutomock();

const dependency = require('./dependency.js');

test('automatically mocks required modules', () => {
  expect(jest.isMockFunction(dependency.calculate)).toBe(true);
  expect(dependency.calculate(2, 3)).toBeUndefined();
  expect(jest.isMockFunction(dependency.nested.execute)).toBe(true);
  expect(dependency.nested.label).toBe('stable');
  expect(dependency.values).toEqual([]);
  expect(jest.isMockFunction(dependency.Calculator)).toBe(true);
  expect(jest.isMockFunction(dependency.Calculator.version)).toBe(true);
  const calculator = new dependency.Calculator();
  expect(jest.isMockFunction(calculator.multiply)).toBe(true);
  expect(calculator.multiply(2, 3)).toBeUndefined();
  expect(require('./dependency.js')).toBe(dependency);
  expect(jest.requireActual('./dependency.js').calculate(2, 3)).toBe(5);
});
