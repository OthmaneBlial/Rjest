enum Direction {
  Up = 'up',
  Down = 'down',
}

test('executes TypeScript syntax that requires transformation', () => {
  expect(Direction.Up).toBe('up');
  expect(Direction.Down).toBe('down');
});
