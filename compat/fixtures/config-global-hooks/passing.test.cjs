const {append} = require('./hook-state.cjs');

test('inherits setup environment', () => {
  expect(process.env.RJEST_GLOBAL_HOOK_ENV).toBe('visible-to-tests');
  append({event: 'passing-test'});
});
