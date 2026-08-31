test('resets setup mocks before the first test', () => {
  expect(cliResetMock).not.toHaveBeenCalled();
  expect(cliResetMock()).toBeUndefined();
  cliResetMock.mockReturnValue('first implementation');
});

test('resets calls and implementations before the next test', () => {
  expect(cliResetMock).not.toHaveBeenCalled();
  expect(cliResetMock()).toBeUndefined();
});
