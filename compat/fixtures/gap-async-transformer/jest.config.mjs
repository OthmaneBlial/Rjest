export default {
  testEnvironment: 'node',
  transform: {
    '^.+\\.mjs$': ['<rootDir>/async-transformer.mjs', {value: 73}],
  },
};
