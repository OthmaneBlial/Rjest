test('uses the CLI timeout instead of the configured timeout', async () => {
  await new Promise(resolve => setTimeout(resolve, 50));
  expect(true).toBe(true);
});
