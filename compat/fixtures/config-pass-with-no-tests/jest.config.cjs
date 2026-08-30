module.exports = {
  passWithNoTests: true,
  rootDir: __dirname,
  testEnvironment: 'node',
  testMatch: ['<rootDir>/**/*.missing.test.js'],
  transform: {},
};
