test('searches only the configured module directory names', () => {
  expect(require('local-only').source).toBe('custom-only');
  expect(() => require('@rjest-fixture/math')).toThrow();
});
