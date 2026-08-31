test('resolves from CLI modulePaths', () => {
  expect(require('cli-path-tool')).toEqual({source: 'module path'});
});
