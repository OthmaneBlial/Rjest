const {appendFileSync} = require('node:fs');

test('runs ESM-sequenced a', () => {
  appendFileSync('esm-sequence.marker', 'a');
  expect(true).toBe(true);
});
