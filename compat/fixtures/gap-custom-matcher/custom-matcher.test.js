expect.extend({
  toBeDivisibleBy(received, divisor) {
    return {
      pass: received % divisor === 0,
      message: () => `expected ${received} to be divisible by ${divisor}`,
    };
  },
  async toResolveCredentialsTo(received, expected) {
    const actual = await received.credentials();
    return {
      pass: this.equals(actual, expected),
      message: () => 'expected credentials provider to resolve equally',
    };
  },
});

test('runs a custom matcher', () => {
  expect(12).toBeDivisibleBy(3);
});

test('awaits an asynchronous custom matcher with matcher context', async () => {
  await expect({
    credentials: async () => ({accessKeyId: 'key', secretAccessKey: 'secret'}),
  }).toResolveCredentialsTo({accessKeyId: 'key', secretAccessKey: 'secret'});
});

test('matches thrown errors with asymmetric and object expectations', async () => {
  const error = Object.assign(new Error('network failed'), {code: 'ERR_NETWORK'});

  expect(() => {
    throw error;
  }).toThrow(expect.objectContaining({code: 'ERR_NETWORK'}));
  await expect(Promise.reject(error)).rejects.toThrow({
    message: 'network failed',
    code: 'ERR_NETWORK',
  });
});
