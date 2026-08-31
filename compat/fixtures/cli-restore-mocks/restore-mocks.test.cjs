test('restores setup spies before the first test', () => {
  expect(cliRestoreTarget.method()).toBe('actual');
  expect(jest.isMockFunction(cliRestoreTarget.method)).toBe(false);
});
