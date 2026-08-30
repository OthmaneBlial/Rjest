const {appendFileSync} = require('node:fs');

test('runs c', () => {
  appendFileSync('sequence.marker', 'c');
  expect(true).toBe(true);
});
