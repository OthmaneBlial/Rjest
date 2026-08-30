test('shares matcher state with the installed expect package', () => {
  expect(42).toBeFortyTwo();
  expect(7).not.toBeFortyTwo();
});
