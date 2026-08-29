test('uses the configured JSDOM environment by default', () => {
  expect(window.document).toBe(document);
});
