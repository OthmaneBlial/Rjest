const {writeFileSync} = require('node:fs');

test('does not run after two failures', () => {
  writeFileSync('passing.marker', 'passing suite executed');
  expect(true).toBe(true);
});
