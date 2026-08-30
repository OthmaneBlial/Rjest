test('alpha uses only the alpha dependency', () => {
  expect(require('@fixture/alpha-wrapper').value).toBe('alpha');
});
