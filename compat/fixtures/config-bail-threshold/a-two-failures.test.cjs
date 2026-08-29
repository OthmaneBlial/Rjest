const {writeFileSync} = require('node:fs');

// Keep this suite larger than the later passing suite so Jest's uncached
// sequencer deterministically schedules it first.
const padding = `
  numeric bail threshold numeric bail threshold numeric bail threshold
  numeric bail threshold numeric bail threshold numeric bail threshold
  numeric bail threshold numeric bail threshold numeric bail threshold
  numeric bail threshold numeric bail threshold numeric bail threshold
  numeric bail threshold numeric bail threshold numeric bail threshold
`;

beforeAll(() => writeFileSync('two-failures.marker', 'failure suite executed'));

test('first failure contributes to the threshold', () => {
  expect(padding.length).toBeGreaterThan(0);
  expect('first received').toBe('first expected');
});

test('second failure reaches the threshold', () => {
  expect('second received').toBe('second expected');
});
