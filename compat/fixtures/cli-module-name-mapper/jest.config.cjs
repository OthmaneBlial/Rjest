module.exports = {
  moduleNameMapper: {'^@value$': '<rootDir>/configured-value.cjs'},
  rootDir: __dirname,
  testEnvironment: 'node',
  testMatch: ['<rootDir>/**/*.test.cjs'],
  transform: {},
};
