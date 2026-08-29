enum Direction {
  Left = 'left',
  Right = 'right',
}

test('uses the implicit babel-jest transform', () => {
  expect(Direction.Right).toBe('right');
});
