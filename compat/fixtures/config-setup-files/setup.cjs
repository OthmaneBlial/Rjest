globalThis.__rjestSetupState = {
  documentType: typeof document,
  expectType: typeof expect,
  jestType: typeof jest,
  order: ['setupFiles'],
  testType: typeof test,
  setupMock: jest.fn(value => `setup:${value}`),
};
