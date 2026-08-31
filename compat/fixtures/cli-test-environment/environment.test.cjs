test('uses the CLI environment and its options', () => {
  expect(window === globalThis).toBe(true);
  expect(document.createElement('main').tagName).toBe('MAIN');
  expect(location.href).toBe('https://rjest.test/cli-environment?mode=proof');
});
