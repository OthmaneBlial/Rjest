module.exports = {
  projects: [
    {
      displayName: 'alpha',
      rootDir: '.',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/shared.test.cjs'],
      moduleNameMapper: {
        '^project-flavor$': '<rootDir>/alpha.cjs',
      },
      transform: {},
    },
    {
      displayName: 'beta',
      rootDir: '.',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/shared.test.cjs'],
      moduleNameMapper: {
        '^project-flavor$': '<rootDir>/beta.cjs',
      },
      transform: {},
    },
  ],
};
