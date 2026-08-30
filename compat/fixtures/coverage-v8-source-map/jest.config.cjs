module.exports = {
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': '<rootDir>/transformer.cjs',
  },
};
