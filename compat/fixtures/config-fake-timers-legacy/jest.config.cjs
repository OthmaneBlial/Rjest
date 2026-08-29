module.exports = {
  fakeTimers: {
    enableGlobally: true,
    legacyFakeTimers: true,
  },
  setupFiles: ['<rootDir>/setup-before.js'],
  setupFilesAfterEnv: ['<rootDir>/setup-after-env.js'],
};
