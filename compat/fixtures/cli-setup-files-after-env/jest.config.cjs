module.exports = {
  rootDir: __dirname,
  setupFilesAfterEnv: ['<rootDir>/configured-after.cjs'],
  testEnvironment: 'node',
  testMatch: ['<rootDir>/**/*.test.cjs'],
  transform: {},
};
