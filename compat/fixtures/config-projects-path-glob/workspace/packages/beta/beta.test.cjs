test('loads a config glob relative to the parent config file', () => {
  expect(__filename.endsWith('beta.test.cjs')).toBe(true);
});
