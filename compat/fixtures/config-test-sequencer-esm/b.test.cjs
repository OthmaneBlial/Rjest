const {appendFileSync} = require('node:fs');

test('runs ESM-sequenced b', () => {
  appendFileSync('esm-sequence.marker', 'b');
  expect(true).toBe(true);
});
