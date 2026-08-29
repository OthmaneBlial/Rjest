module.exports = {
  collectCoverage: true,
  coverageDirectory: '<rootDir>/.coverage',
  coverageReporters: ['json-summary'],
  coverageThreshold: {
    global: {
      statements: 100,
    },
  },
  testEnvironment: 'node',
};
