test('ordinary test is skipped when focus exists', () => {
  throw new Error('must not run');
});

test.only('focused test runs', () => {
  expect('focused').toBeTruthy();
});
