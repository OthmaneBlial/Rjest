const {writeFileSync} = require('node:fs');

test('primes the configured cache', () => {
  writeFileSync('failing.marker', 'cache primer executed');
  expect('received').toBe('expected');
});
