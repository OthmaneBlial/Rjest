test('resolves from CLI moduleDirectories', () => {
  expect(require('cli-tool')).toEqual({source: 'custom directory'});
});
