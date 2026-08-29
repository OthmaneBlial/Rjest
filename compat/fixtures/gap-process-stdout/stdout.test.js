process.stdout.write('application output without a line break');

test('raw stdout does not corrupt the runner protocol', () => {
  expect(true).toBe(true);
});
