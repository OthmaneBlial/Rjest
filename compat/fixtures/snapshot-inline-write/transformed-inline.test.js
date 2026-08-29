test('rewrites a callsite remapped through a Babel source map', () => {
  expect({nested: {value: 1}}).toMatchInlineSnapshot();
});
