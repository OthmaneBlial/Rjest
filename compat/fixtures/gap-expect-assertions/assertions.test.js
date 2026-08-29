test('counts synchronous assertions', () => {
  expect.assertions(2);
  expect(1 + 1).toBe(2);
  expect('rjest').toContain('jest');
});

test('counts asynchronous assertions', async () => {
  expect.assertions(1);
  await expect(Promise.resolve('ready')).resolves.toBe('ready');
});

test('requires at least one assertion', () => {
  expect.hasAssertions();
  expect(true).toBeTruthy();
});

test('fails when the exact count is not reached', () => {
  expect.assertions(2);
  expect('only one').toBeDefined();
});

test('fails when no assertion is reached', () => {
  expect.hasAssertions();
});
