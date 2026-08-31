const dependency = require('./dependency.cjs');

test('disables configured mock runtime automation', () => {
  expect(jest.isMockFunction(dependency.calculate)).toBe(false);
  expect(dependency.calculate(2, 3)).toBe(5);
  expect(cliNegationMock()).toBe('setup implementation');
  expect(cliNegationTarget.method()).toBe('mocked');
  expect(require('./counter.cjs')).toBe(cliNegationSetupInstance);
});

test('retains mock state and the module registry for the next test', () => {
  expect(cliNegationMock).toHaveBeenCalledTimes(1);
  expect(cliNegationMock()).toBe('setup implementation');
  expect(cliNegationTarget.method()).toBe('mocked');
  expect(require('./counter.cjs')).toBe(cliNegationSetupInstance);
});
