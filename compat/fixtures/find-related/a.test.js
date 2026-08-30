const a = require('./wrapper');
const b = require('./b');

test('a follows a transitive dependency while loading b too', () => {
  expect([a.value, b.value]).toEqual(['a', 'b']);
});
