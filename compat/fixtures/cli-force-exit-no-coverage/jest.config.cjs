module.exports = {
  collectCoverage: true,
  reporters: ['<rootDir>/reporter.cjs'],
  testEnvironment: 'node',
  testMatch: ['<rootDir>/runtime.test.cjs'],
  transform: {},
};
