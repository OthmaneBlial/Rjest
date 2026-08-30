const b = require('./b');

test('b suite loads only b', () => {
  expect(b.value).toBe('b');
});
