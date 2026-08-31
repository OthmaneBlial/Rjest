test('replaces configured setupFilesAfterEnv from the CLI', () => {
  expect(globalThis.configuredAfterEnvRan).toBeUndefined();
  expect(globalThis.cliAfterEnvValue).toBeCliReady();
});
