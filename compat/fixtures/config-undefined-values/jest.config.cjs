module.exports = () => ({
  displayName: undefined,
  resolver: undefined,
  testEnvironment: 'node',
  testEnvironmentOptions: {
    nested: {
      retained: 'yes',
      omitted: undefined,
    },
  },
  testMatch: ['<rootDir>/undefined-values.test.cjs'],
});
