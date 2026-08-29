test('resetMocks resets setup mocks before the first test without restoring', () => {
  expect(resetMocksSetupMock).toHaveBeenCalledTimes(0);
  expect(resetMocksSetupMock()).toBeUndefined();
  expect(jest.isMockFunction(resetMocksSetupTarget.method)).toBe(true);
  expect(resetMocksSetupTarget.method()).toBeUndefined();
  expect(resetMocksSetupTarget.value).toBe('setup replaced value');
  expect(jest.isMockFunction(setTimeout)).toBe(true);
  expect(jest.getTimerCount()).toBe(1);

  resetMocksSetupMock.mockReturnValue('first test implementation');
  resetMocksSetupTarget.method.mockReturnValue('first test spy');
  setTimeout(resetMocksTimerCallback, 10);
  jest.runAllTimers();
  expect(resetMocksSetupMock()).toBe('first test implementation');
  expect(resetMocksSetupTarget.method()).toBe('first test spy');
  expect(resetMocksTimerCallback).toHaveBeenCalledTimes(2);
});

test('resetMocks clears calls and implementations again before the next test', () => {
  expect(resetMocksSetupMock).toHaveBeenCalledTimes(0);
  expect(resetMocksSetupMock()).toBeUndefined();
  expect(resetMocksSetupTarget.method).toHaveBeenCalledTimes(0);
  expect(resetMocksSetupTarget.method()).toBeUndefined();
  expect(resetMocksSetupTarget.value).toBe('setup replaced value');
  expect(jest.isMockFunction(setTimeout)).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
  expect(resetMocksTimerCallback).toHaveBeenCalledTimes(0);
});
