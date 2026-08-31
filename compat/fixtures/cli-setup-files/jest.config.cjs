module.exports = {
  rootDir: __dirname,
  setupFiles: ['<rootDir>/configured-before.cjs'],
  testEnvironment: 'node',
  testMatch: ['<rootDir>/**/*.test.cjs'],
  transform: {},
};
