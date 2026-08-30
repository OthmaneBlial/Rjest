test('runs the first CLI project directory', () => {
  expect(__filename.endsWith('alpha.test.cjs')).toBe(true);
});
