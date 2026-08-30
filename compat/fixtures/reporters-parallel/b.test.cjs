test('parallel file b', async () => {
  await new Promise(resolve => setTimeout(resolve, 25));
  expect('b').toBe('b');
});
