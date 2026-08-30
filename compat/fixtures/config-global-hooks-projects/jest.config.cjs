module.exports = {
  globalSetup: '<rootDir>/shared-setup.cjs',
  globalTeardown: '<rootDir>/shared-teardown.cjs',
  projects: [
    {
      displayName: 'alpha',
      globalSetup: '<rootDir>/shared-setup.cjs',
      globalTeardown: '<rootDir>/shared-teardown.cjs',
      rootDir: '<rootDir>',
      testMatch: ['<rootDir>/packages/alpha/**/*.test.cjs'],
      transform: {},
    },
    {
      displayName: 'beta',
      globalSetup: '<rootDir>/beta-setup.cjs',
      globalTeardown: '<rootDir>/beta-teardown.cjs',
      rootDir: '<rootDir>',
      testMatch: ['<rootDir>/packages/beta/**/*.test.cjs'],
      transform: {},
    },
  ],
  testEnvironment: 'node',
  transform: {},
};
