module.exports = {
  detectOpenHandles: true,
  forceExit: true,
  globals: {
    __DEV__: true,
    nested: {value: 42},
  },
  haste: {
    defaultPlatform: 'ios',
    platforms: ['android', 'ios', 'native'],
  },
  maxConcurrency: 1,
  moduleFileExtensions: ['js', 'cjs'],
  passWithNoTests: true,
  rootDir: __dirname,
  testEnvironment: 'node',
  testMatch: ['<rootDir>/**/*.test.cjs'],
  transform: {},
};
