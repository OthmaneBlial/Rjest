test('rewrites a native ESM callsite', () => {
  expect({module: 'esm'}).toMatchInlineSnapshot();
});
