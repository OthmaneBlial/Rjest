test('inherits setup and mapping from a Jest preset', () => {
  expect(globalThis.presetBefore).toBe('before');
  expect(globalThis.presetAfter).toBe('after');
  expect(require('preset-value')).toBe('mapped by preset');
});
