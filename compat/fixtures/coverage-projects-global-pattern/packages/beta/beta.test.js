const {add} = require('./beta');

test('adds values', () => {
  expect(add(2, 3)).toBe(5);
});
