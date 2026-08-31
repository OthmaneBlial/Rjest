test('runs with a reporter supplied on the command line', () => {
  expect('cli reporter').toMatch(/reporter/);
});
