test('enables configured legacy timers before setupFilesAfterEnv', () => {
  expect(globalThis.legacyTimerSetupState).toEqual({
    datePreserved: true,
    timerIsMock: true,
    timerNow: 0,
  });
  expect(jest.isMockFunction(setTimeout)).toBe(true);
});
