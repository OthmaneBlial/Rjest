module.exports = {
  projects: [
    {
      displayName: 'nested',
      rootDir: 'src',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/nested.test.cjs'],
      transform: {},
    },
  ],
};
