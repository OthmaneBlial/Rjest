test('preloads a top-level-await ESM resolver', () => {
  expect(require('tla-resolver-target').loaded).toBe(
    'through-tla-esm-resolver',
  );
  expect(require('./relative.cjs').loaded).toBe('through-default-resolver');
});
