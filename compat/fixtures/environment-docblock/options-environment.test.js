/**
 * @jest-environment jsdom
 * @jest-environment-options {"url":"https://docblock.example/path"}
 */

test('merges test-file environment options', () => {
  expect(window.location.href).toBe('https://docblock.example/path');
});
