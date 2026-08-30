const {append} = require('./hook-state.cjs');

test('still runs teardown after a failed test', () => {
  append({event: 'failing-test'});
  expect('received').toBe('expected');
});
