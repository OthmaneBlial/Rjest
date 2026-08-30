module.exports = {
  rootDir: __dirname,
  testEnvironment: 'node',
  testMatch: ['**/*.test.cjs', '**/*.test.mjs'],
  testResultsProcessor: '<rootDir>/processor.cjs',
  moduleNameMapper: {
    '^@fixture/(.*)$': '<rootDir>/$1.cjs',
  },
  transform: {},
  watchPathIgnorePatterns: ['<rootDir>/watch-results\\.jsonl$'],
};
