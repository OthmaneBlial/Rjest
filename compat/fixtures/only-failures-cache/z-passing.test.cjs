const {writeFileSync} = require('node:fs');

test('is excluded from the next only-failures run', () => {
  writeFileSync('passing.marker', 'passing file executed');
  expect(true).toBe(true);
});
