test('offers module-sync only when Jest can synchronously evaluate ESM', () => {
  expect(require('@rjest-fixture/math')).toBe('commonjs require condition');
});
