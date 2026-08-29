const {choose} = require('./source');

test('covers only one path', () => {
  expect(choose(true)).toBe('yes');
});
