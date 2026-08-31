test('uses the CLI globals object', () => {
  expect(source).toBe('cli');
  expect(nested).toEqual({proof: 42});
});
