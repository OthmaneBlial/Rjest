const {expect: importedExpect, test: importedTest} = require('@jest/globals');

importedTest('applies CLI runtime options to beta', async () => {
  importedExpect(globalThis.test).toBeUndefined();
  importedExpect(globalThis.expect).toBeUndefined();
  await new Promise(resolve => setTimeout(resolve, 50));
  importedExpect(true).toBe(true);
});
