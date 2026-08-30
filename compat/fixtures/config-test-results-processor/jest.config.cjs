module.exports = {
  rootDir: __dirname,
  globalSetup: '<rootDir>/setup.cjs',
  globalTeardown: '<rootDir>/teardown.cjs',
  testEnvironment: 'node',
  testResultsProcessor: '<rootDir>/processor.cjs',
  transform: {},
};
