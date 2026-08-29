jest.enableAutomock();

const dependency = require('./dependency.js');

test('automatically mocks required modules', () => {
  expect(jest.isMockFunction(dependency.calculate)).toBe(true);
  expect(dependency.calculate(2, 3)).toBeUndefined();
});
