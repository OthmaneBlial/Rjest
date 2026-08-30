const {writeFileSync} = require('node:fs');

test('fails while cache is disabled', () => {
  writeFileSync('failing.marker', 'cache-disabled failure executed');
  expect('received').toBe('expected');
});
