test('second file starts with fresh state', () => {
  expect(globalThis.fileSetupCount).toBe(1);
  expect(globalThis.fileStateLeak).toBeUndefined();
  expect(process.env.RJEST_FILE_STATE_LEAK).toBeUndefined();
  expect(require('./shared.cjs').value).toBe(42);
  globalThis.fileStateLeak = true;
  process.env.RJEST_FILE_STATE_LEAK = 'second';
  require('./shared.cjs').value = 101;
});
