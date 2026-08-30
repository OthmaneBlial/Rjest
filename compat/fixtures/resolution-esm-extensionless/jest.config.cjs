module.exports = {
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': '<rootDir>/transformer.cjs',
  },
};
