test('applies configured modern timer options before setupFilesAfterEnv', () => {
  expect(globalThis.modernTimerSetupState).toEqual({
    clock: 1234,
    clearTimeoutPreserved: true,
    performancePreserved: true,
    setTimeoutReplaced: true,
  });
  expect(jest.isMockFunction(setTimeout)).toBe(false);

  function recurse() {
    setTimeout(recurse, 0);
  }
  setTimeout(recurse, 0);
  expect(() => jest.runAllTimers()).toThrow('3 timers');
});
