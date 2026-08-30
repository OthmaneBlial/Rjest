module.exports = {
  rootDir: __dirname,
  testEnvironment: 'node',
  testMatch: ['**/*.test.cjs'],
  testResultsProcessor: '<rootDir>/processor.cjs',
  transform: {},
  watchPathIgnorePatterns: ['<rootDir>/watch-results\\.jsonl$'],
};
