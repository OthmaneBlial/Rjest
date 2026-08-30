test('deep-copies configured globals into each test-file environment', () => {
  expect(nested).toEqual({value: 42});
});
