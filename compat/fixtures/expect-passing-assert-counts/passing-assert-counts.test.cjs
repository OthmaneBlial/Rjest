test('tracks passing assertions separately from caught failures', () => {
  expect(expect.getState().numPassingAsserts).toBe(0);
  expect('same').toBe('same');

  try {
    expect('same').toBe('different');
  } catch {}

  expect(expect.getState().numPassingAsserts).toBe(2);
  expect('same').not.toBe('different');
  expect(expect.getState().numPassingAsserts).toBe(4);
});

test('tracks asynchronous custom matcher outcomes', async () => {
  expect.extend({
    async toResolveAs(received, expected) {
      await Promise.resolve();
      return {
        message: () => `expected ${received} to resolve as ${expected}`,
        pass: received === expected,
      };
    },
  });

  await expect('value').toResolveAs('value');
  try {
    await expect('value').toResolveAs('other');
  } catch {}

  expect(expect.getState().numPassingAsserts).toBe(1);
});
