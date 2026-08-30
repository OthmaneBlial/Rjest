module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.js$': '<rootDir>/transformer.cjs',
  },
};
