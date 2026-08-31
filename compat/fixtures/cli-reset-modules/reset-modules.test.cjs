test('resets the setup module registry before the first test', () => {
  const testInstance = require('./counter.cjs');
  expect(testInstance).not.toBe(cliSetupModuleInstance);
  expect(testInstance.evaluation).toBeGreaterThan(cliSetupModuleInstance.evaluation);
});
