module.exports = {
  automock: true,
  clearMocks: true,
  resetMocks: true,
  resetModules: true,
  restoreMocks: true,
  rootDir: __dirname,
  setupFilesAfterEnv: ['<rootDir>/setup-after.cjs'],
  testEnvironment: 'node',
  testMatch: ['<rootDir>/**/*.test.cjs'],
  transform: {},
};
