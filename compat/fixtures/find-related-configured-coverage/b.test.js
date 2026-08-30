const b = require('./b');

test('b follows its direct dependency', () => {
  expect(b.value).toBe('b');
});
