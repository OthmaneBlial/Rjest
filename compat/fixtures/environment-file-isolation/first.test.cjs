test('first file starts with fresh state', () => {
  expect(globalThis.fileSetupCount).toBe(1);
  expect(globalThis.fileStateLeak).toBeUndefined();
  expect(process.env.RJEST_FILE_STATE_LEAK).toBeUndefined();
  expect(require('./shared.cjs').value).toBe(42);
  globalThis.fileStateLeak = true;
  process.env.RJEST_FILE_STATE_LEAK = 'first';
  require('./shared.cjs').value = 99;
  jest.mock('./shared.cjs', () => ({value: 7}));
  expect(require('./shared.cjs').value).toBe(7);
});
