module.exports = {
  rootDir: __dirname,
  testEnvironment: 'node',
  transform: {
    '^.+\\.js$': '<rootDir>/transformer.cjs',
  },
};
