const a = require('./a');
const b = require('./b');

test('a suite loads both source modules', () => {
  expect([a.value, b.value]).toEqual(['a', 'b']);
});
