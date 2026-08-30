module.exports = {
  collectCoverage: true,
  collectCoverageFrom: ['**/*.js', '!**/*.test.js'],
  coverageDirectory: '<rootDir>/.coverage',
  coverageProvider: 'v8',
  coverageReporters: ['json-summary'],
  testEnvironment: 'node',
};
