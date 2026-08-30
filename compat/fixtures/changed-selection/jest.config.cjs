module.exports = {
  rootDir: __dirname,
  testEnvironment: 'node',
  testMatch: ['**/*.test.cjs', '**/*.test.mjs'],
  moduleNameMapper: {
    '^@fixture/(.*)$': '<rootDir>/$1.cjs',
  },
  transform: {},
};
