// This deliberately larger file runs first in Jest's uncached size-based
// sequencer, making the serial bail boundary deterministic.
const padding = `
  failure suite padding failure suite padding failure suite padding
  failure suite padding failure suite padding failure suite padding
  failure suite padding failure suite padding failure suite padding
  failure suite padding failure suite padding failure suite padding
  failure suite padding failure suite padding failure suite padding
  failure suite padding failure suite padding failure suite padding
  failure suite padding failure suite padding failure suite padding
  failure suite padding failure suite padding failure suite padding
`;

test('fails before the passing suite is scheduled', () => {
  expect(padding.length).toBeGreaterThan(0);
  expect('received').toBe('expected');
});
