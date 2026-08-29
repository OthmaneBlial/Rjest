test('would fail if discovery crossed the package boundary', () => {
  throw new Error('ancestor config must not apply');
});
