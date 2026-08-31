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

importedDescribe('with explicit framework imports', () => {
  importedTest('does not inject Jest APIs into globalThis', () => {
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
