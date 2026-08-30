test('parallel file a', async () => {
  await new Promise(resolve => setTimeout(resolve, 25));
  expect('a').toBe('a');
});
