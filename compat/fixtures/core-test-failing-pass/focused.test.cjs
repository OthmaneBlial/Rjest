test('is skipped when a failing test is focused', () => {
  throw new Error('must remain focused out');
});

test.only.failing('supports only.failing', () => {
  throw new Error('expected failure');
});

test.only.failing.each([[1], [2]])('supports only.failing.each for %i', value => {
  expect(value).toBe(0);
});
