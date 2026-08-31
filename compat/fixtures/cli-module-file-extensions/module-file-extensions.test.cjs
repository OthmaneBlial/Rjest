test('resolves the CLI moduleFileExtensions order', () => {
  expect(require('./value')).toEqual({source: 'special extension'});
});
