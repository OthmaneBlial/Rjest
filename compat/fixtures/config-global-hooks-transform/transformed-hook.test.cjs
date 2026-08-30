const {append} = require('./hook-state.cjs');

test('inherits an environment value from a transformed setup module', () => {
  expect(process.env.RJEST_TRANSFORMED_GLOBAL_HOOK).toBe('ready');
  append({event: 'test'});
});
