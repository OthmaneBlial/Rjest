module.exports = {
  resetModules: false,
  rootDir: __dirname,
  setupFilesAfterEnv: ['<rootDir>/setup-after.cjs'],
  testEnvironment: 'node',
  testMatch: ['<rootDir>/**/*.test.cjs'],
  transform: {},
};
