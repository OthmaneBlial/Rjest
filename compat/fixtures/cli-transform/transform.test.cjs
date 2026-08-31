test('uses the transform supplied on the command line', () => {
  expect(require('./value')).toBe('cli transformed');
});
