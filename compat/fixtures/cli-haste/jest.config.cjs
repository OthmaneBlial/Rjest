module.exports = {
  rootDir: __dirname,
  testEnvironment: 'node',
  testMatch: ['**/*.test.cjs'],
  transform: {},
  haste: {
    defaultPlatform: 'ios',
    platforms: ['ios', 'native'],
  },
};
