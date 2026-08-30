test('alpha follows its mapped transitive dependency', () => {
  expect(require('@fixture/alpha-wrapper').value).toBe('alpha');
});
