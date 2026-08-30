module.exports = {
  globalSetup: '<rootDir>/setup.ts',
  globalTeardown: '<rootDir>/teardown.ts',
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': [
      'babel-jest',
      {
        presets: [
          [process.env.RJEST_COMPAT_TYPESCRIPT_PRESET, {allExtensions: true}],
        ],
      },
    ],
  },
};
