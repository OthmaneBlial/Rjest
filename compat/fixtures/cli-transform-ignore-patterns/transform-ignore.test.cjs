test('uses the transform ignore pattern supplied on the command line', () => {
  expect(require('./ignored/value.cjs')).toBe('not transformed');
});
