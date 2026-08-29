module.exports = {
  fakeTimers: {
    doNotFake: ['clearTimeout', 'performance'],
    enableGlobally: true,
    legacyFakeTimers: false,
    now: 1234,
    timerLimit: 3,
  },
  setupFiles: ['<rootDir>/setup-before.js'],
  setupFilesAfterEnv: ['<rootDir>/setup-after-env.js'],
};
