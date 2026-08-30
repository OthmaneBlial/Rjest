test('loads a project directory relative to the parent root', () => {
  expect(__filename.endsWith('alpha.test.cjs')).toBe(true);
});
