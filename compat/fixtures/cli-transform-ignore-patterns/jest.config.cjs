module.exports = {
  rootDir: __dirname,
  testEnvironment: 'node',
  testMatch: ['**/*.test.cjs'],
  transform: {'^.+\\.cjs$': '<rootDir>/transformer.cjs'},
  transformIgnorePatterns: ['never-ignore-this-fixture'],
};
