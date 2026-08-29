const value = require('@app/value');

test('resolves a moduleNameMapper alias', () => {
  expect(value).toBe('mapped');
});
