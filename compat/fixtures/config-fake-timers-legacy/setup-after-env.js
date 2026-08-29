globalThis.legacyTimerSetupState = {
  datePreserved: Date === globalThis.realDateBeforeGlobalTimers,
  timerIsMock: jest.isMockFunction(setTimeout),
  timerNow: jest.now(),
};
