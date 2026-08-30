module.exports = {
  reporters: ['<rootDir>/reporter.cjs'],
  projects: [
    {
      displayName: {name: 'alpha', color: 'blue'},
      rootDir: '<rootDir>/packages/alpha',
      testEnvironment: 'node',
      transform: {},
    },
    {
      displayName: {name: 'beta', color: 'red'},
      rootDir: '<rootDir>/packages/beta',
      testEnvironment: 'node',
      transform: {},
    },
  ],
};
