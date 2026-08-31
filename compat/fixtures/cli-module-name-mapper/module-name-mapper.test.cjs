test('uses the CLI moduleNameMapper object', () => {
  expect(require('@value')).toEqual({source: 'CLI mapper'});
});
