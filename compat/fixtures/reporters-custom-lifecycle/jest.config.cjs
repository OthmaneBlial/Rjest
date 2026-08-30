module.exports = {
  reporters: [
    [
      '<rootDir>/reporter.mjs',
      {label: 'configured'},
    ],
  ],
  testEnvironment: 'node',
  transform: {},
};
