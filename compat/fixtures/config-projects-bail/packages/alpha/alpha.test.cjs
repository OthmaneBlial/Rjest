const {writeFileSync} = require('node:fs');

test('would pass if the second project had not reached bail', () => {
  writeFileSync('alpha.marker', 'alpha project executed');
  expect(true).toBe(true);
});
