test('uses the Haste platform supplied on the command line', () => {
  expect(require('./platform')).toBe('native');
});
