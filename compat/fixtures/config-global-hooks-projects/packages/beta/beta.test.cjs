const {append} = require('../../hook-state.cjs');

test('runs beta', () => {
  append({event: 'beta-test'});
  expect(true).toBe(true);
});
