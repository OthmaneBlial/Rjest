jest.mock('node:fs', () => ({
  readFileSync: () => 'mocked file contents',
}));

test('does not reuse dependencies loaded by the transformer runtime', () => {
  const readCapturedFile = require('./consumer.cjs');
  expect(readCapturedFile()).toBe('mocked file contents');
});
