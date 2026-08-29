test('rewrites TypeScript without changing its type syntax', () => {
  const value: {answer: number} = {answer: 42};
  expect(value).toMatchInlineSnapshot();
});
