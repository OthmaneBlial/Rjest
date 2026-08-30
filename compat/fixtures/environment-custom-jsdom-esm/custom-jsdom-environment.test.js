test('runs in a top-level-await ESM JSDOM environment', () => {
  expect(environmentModuleKind).toBe('top-level-await-esm');
  expect(environmentJsdomSetup).toMatch(/loading|interactive|complete/);
  expect(window).toBe(globalThis);
  expect(document.createElement('main').tagName).toBe('MAIN');
  expect(location.href).toBe('https://custom-environment.example/path');
});
