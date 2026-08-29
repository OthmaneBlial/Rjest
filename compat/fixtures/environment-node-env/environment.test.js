test('defaults NODE_ENV to test when it was not supplied', () => {
  expect(process.env.NODE_ENV).toBe('test');
});
