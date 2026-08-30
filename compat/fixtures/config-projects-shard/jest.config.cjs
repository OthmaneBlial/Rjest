module.exports = {
  projects: [
    {
      displayName: 'alpha',
      rootDir: '<rootDir>/alpha',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/**/*.test.cjs'],
      transform: {},
    },
    {
      displayName: 'beta',
      rootDir: '<rootDir>/beta',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/**/*.test.cjs'],
      transform: {},
    },
  ],
};
