// The uncached Jest sequencer uses file size when no duration history exists.
// This padding makes the failing beta project run before the smaller passing
// alpha project even though alpha appears first in the projects array.
const {writeFileSync} = require('node:fs');
const padding = `
  beta failure padding beta failure padding beta failure padding
  beta failure padding beta failure padding beta failure padding
  beta failure padding beta failure padding beta failure padding
  beta failure padding beta failure padding beta failure padding
  beta failure padding beta failure padding beta failure padding
  beta failure padding beta failure padding beta failure padding
  beta failure padding beta failure padding beta failure padding
  beta failure padding beta failure padding beta failure padding
  beta failure padding beta failure padding beta failure padding
  beta failure padding beta failure padding beta failure padding
  beta failure padding beta failure padding beta failure padding
  beta failure padding beta failure padding beta failure padding
`;

test('fails before another project is scheduled', () => {
  writeFileSync('beta.marker', 'beta project executed');
  expect(padding.length).toBeGreaterThan(0);
  expect('received').toBe('expected');
});
