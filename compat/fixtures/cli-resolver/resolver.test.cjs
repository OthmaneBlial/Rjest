test('uses the CLI custom resolver', () => {
  expect(require('@virtual')).toEqual({source: 'CLI resolver'});
});
