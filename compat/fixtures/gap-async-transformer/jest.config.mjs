export default {
  testEnvironment: 'node',
  transform: {
    '^.+\\.mjs$': ['<rootDir>/async-transformer.cjs', {value: 73}],
  },
};
