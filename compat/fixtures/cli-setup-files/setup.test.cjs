test('replaces configured setupFiles from the CLI', () => {
  expect(globalThis.configuredSetupRan).toBeUndefined();
  expect(globalThis.cliSetupValue).toBe('before-framework');
});
