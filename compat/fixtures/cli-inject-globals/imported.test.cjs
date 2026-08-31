const {
  afterAll: importedAfterAll,
  beforeEach: importedBeforeEach,
  describe: importedDescribe,
  expect: importedExpect,
  jest: importedJest,
  test: importedTest,
} = require('@jest/globals');

const calls = [];

importedBeforeEach(() => {
  calls.push('beforeEach');
});

importedDescribe('with globals disabled from the CLI', () => {
  importedTest('keeps explicit framework imports available', () => {
    calls.push('test');
    importedExpect(globalThis.test).toBeUndefined();
    importedExpect(globalThis.expect).toBeUndefined();
    importedExpect(globalThis.jest).toBeUndefined();
    importedExpect(importedJest.isMockFunction(importedJest.fn())).toBe(true);
  });
});

importedAfterAll(() => {
  importedExpect(calls).toEqual(['beforeEach', 'test']);
});
