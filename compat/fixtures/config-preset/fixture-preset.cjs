module.exports = {
  setupFiles: ['<rootDir>/preset-before.cjs'],
  setupFilesAfterEnv: ['<rootDir>/preset-after.cjs'],
  moduleNameMapper: {
    '^preset-value$': '<rootDir>/preset-value.cjs',
  },
};
