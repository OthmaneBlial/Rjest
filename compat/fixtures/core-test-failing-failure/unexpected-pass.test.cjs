test.failing('fails when its body unexpectedly passes', () => {
  expect(true).toBe(true);
});

test.failing('fails when its async body unexpectedly resolves', async () => {
  await Promise.resolve();
});
