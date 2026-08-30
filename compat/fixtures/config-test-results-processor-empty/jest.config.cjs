module.exports = {
  rootDir: __dirname,
  passWithNoTests: true,
  testEnvironment: 'node',
  testMatch: ['**/missing-tests/**/*.test.js'],
  testResultsProcessor: '<rootDir>/processor.cjs',
  transform: {},
};
