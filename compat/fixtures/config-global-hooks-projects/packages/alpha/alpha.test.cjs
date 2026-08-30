const {append} = require('../../hook-state.cjs');

test('runs alpha', () => {
  append({event: 'alpha-test'});
  expect(true).toBe(true);
});
