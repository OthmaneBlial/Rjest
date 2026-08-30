test('accepts the project-level silent option', () => {
  console.log('this output is suppressed by the reporter');
  expect(true).toBe(true);
});
